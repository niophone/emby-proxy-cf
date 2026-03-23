<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

type LineItem = {
  id: number;
  name: string;
  entry_domain: string;
  origin_domain: string;
  fast_domain: string;
  weight: number;
  tags: string;
  enabled: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

type FastDomainItem = {
  id: number;
  domain: string;
  label: string;
  is_default: number;
};

const API_BASE = '/api';
const password = ref(localStorage.getItem('adminPassword') || '');
const authed = ref(false);
const loading = ref(false);
const error = ref('');
const lines = ref<LineItem[]>([]);
const fastDomains = ref<FastDomainItem[]>([]);
const search = ref('');
const tagFilter = ref('');
const sortBy = ref<'weight' | 'name' | 'updated'>('weight');
const sortDir = ref<'desc' | 'asc'>('desc');
const showEnabledOnly = ref(false);
const selectedIds = ref<Set<number>>(new Set());

const form = reactive({
  id: null as number | null,
  name: '',
  entry_domain: '',
  origin_domain: '',
  fast_domain: '',
  weight: 100,
  tags: '',
  enabled: true,
  notes: '',
});

const customFastDomain = ref('');
const CUSTOM_FAST_DOMAIN_VALUE = '__custom__';

const authHeaders = () => ({
  Authorization: `Bearer ${password.value.trim()}`,
});

const clearError = () => {
  error.value = '';
};

const setError = (message: string) => {
  error.value = message;
};

const handleResponseError = async (response: Response) => {
  let message = `请求失败 (${response.status})`;
  try {
    const data = await response.json();
    if (data?.error) {
      message = data.error;
    }
  } catch {
    // noop
  }
  setError(message);
};

const resetForm = () => {
  form.id = null;
  form.name = '';
  form.entry_domain = '';
  form.origin_domain = '';
  form.fast_domain = fastDomains.value[0]?.domain ?? '';
  customFastDomain.value = '';
  form.weight = 100;
  form.tags = '';
  form.enabled = true;
  form.notes = '';
};

const login = async () => {
  clearError();
  const raw = password.value.trim();
  if (!raw) {
    setError('请输入登录密码');
    return;
  }
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/auth/check`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) {
      await handleResponseError(res);
      return;
    }
    localStorage.setItem('adminPassword', raw);
    authed.value = true;
    await loadAll();
  } finally {
    loading.value = false;
  }
};


const loadLines = async () => {
  const res = await fetch(`${API_BASE}/lines`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    await handleResponseError(res);
    return;
  }
  lines.value = await res.json();
};

const loadFastDomains = async () => {
  const res = await fetch(`${API_BASE}/fast-domains`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    await handleResponseError(res);
    return;
  }
  fastDomains.value = await res.json();
};

const loadAll = async () => {
  clearError();
  loading.value = true;
  try {
    await Promise.all([loadLines(), loadFastDomains()]);
    if (!form.fast_domain) {
      resetForm();
    }
  } finally {
    loading.value = false;
  }
};

const saveLine = async () => {
  clearError();
  if (!form.name.trim()) {
    setError('线路名称不能为空');
    return;
  }
  const resolvedFastDomain =
    form.fast_domain === CUSTOM_FAST_DOMAIN_VALUE
      ? customFastDomain.value.trim()
      : form.fast_domain.trim();
  if (!form.entry_domain.trim() || !form.origin_domain.trim() || !resolvedFastDomain) {
    setError('访问域名、回源域名、优选域名不能为空');
    return;
  }
  loading.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      entry_domain: form.entry_domain.trim(),
      origin_domain: form.origin_domain.trim(),
      fast_domain: resolvedFastDomain,
      weight: Number(form.weight),
      tags: form.tags.trim(),
      enabled: form.enabled,
      notes: form.notes.trim(),
    };

    const res = await fetch(
      form.id ? `${API_BASE}/lines/${form.id}` : `${API_BASE}/lines`,
      {
        method: form.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      await handleResponseError(res);
      return;
    }

    resetForm();
    await loadLines();
  } finally {
    loading.value = false;
  }
};

const editLine = (line: LineItem) => {
  form.id = line.id;
  form.name = line.name;
  form.entry_domain = line.entry_domain;
  form.origin_domain = line.origin_domain;
  const exists = fastDomains.value.some((item) => item.domain === line.fast_domain);
  if (exists) {
    form.fast_domain = line.fast_domain;
    customFastDomain.value = '';
  } else {
    form.fast_domain = CUSTOM_FAST_DOMAIN_VALUE;
    customFastDomain.value = line.fast_domain;
  }
  form.weight = line.weight;
  form.tags = line.tags;
  form.enabled = line.enabled === 1;
  form.notes = line.notes;
};

const removeLine = async (line: LineItem) => {
  if (!confirm(`确定删除线路 ${line.name} 吗？`)) {
    return;
  }
  clearError();
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/lines/${line.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      await handleResponseError(res);
      return;
    }
    selectedIds.value.delete(line.id);
    await loadLines();
  } finally {
    loading.value = false;
  }
};

const toggleEnabled = async (line: LineItem) => {
  clearError();
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/lines/${line.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        enabled: line.enabled === 1 ? 0 : 1,
      }),
    });
    if (!res.ok) {
      await handleResponseError(res);
      return;
    }
    await loadLines();
  } finally {
    loading.value = false;
  }
};

const handleFastDomainChange = (value: string) => {
  if (value !== CUSTOM_FAST_DOMAIN_VALUE) {
    customFastDomain.value = '';
  }
};

const filteredLines = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const tagKeyword = tagFilter.value.trim().toLowerCase();
  const list = lines.value.filter((line) => {
    if (showEnabledOnly.value && line.enabled !== 1) return false;
    if (keyword) {
      const text = `${line.name} ${line.entry_domain} ${line.origin_domain} ${line.fast_domain} ${
        line.tags
      } ${line.notes}`.toLowerCase();
      if (!text.includes(keyword)) return false;
    }
    if (tagKeyword) {
      const tags = line.tags.toLowerCase().split(',').map((t) => t.trim());
      if (!tags.includes(tagKeyword)) return false;
    }
    return true;
  });

  const sorted = [...list].sort((a, b) => {
    if (sortBy.value === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy.value === 'updated') {
      return a.updated_at.localeCompare(b.updated_at);
    }
    return b.weight - a.weight;
  });

  if (sortDir.value === 'asc') {
    sorted.reverse();
  }
  return sorted;
});

const selectedCount = computed(() => selectedIds.value.size);
const allSelected = computed(
  () => filteredLines.value.length > 0 && selectedIds.value.size === filteredLines.value.length
);

const toggleSelect = (id: number) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

const toggleSelectAll = () => {
  if (allSelected.value) {
    selectedIds.value.clear();
  } else {
    selectedIds.value = new Set(filteredLines.value.map((line) => line.id));
  }
};

const clearSelection = () => {
  selectedIds.value.clear();
};

const batchUpdate = async (payload: Record<string, unknown>) => {
  loading.value = true;
  try {
    await Promise.all(
      [...selectedIds.value].map((id) =>
        fetch(`${API_BASE}/lines/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify(payload),
        })
      )
    );
    await loadLines();
  } finally {
    loading.value = false;
  }
};

const batchDelete = async () => {
  if (selectedIds.value.size === 0) return;
  if (!confirm(`确定删除已选中的 ${selectedIds.value.size} 条线路吗？`)) return;
  loading.value = true;
  try {
    await Promise.all(
      [...selectedIds.value].map((id) =>
        fetch(`${API_BASE}/lines/${id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        })
      )
    );
    selectedIds.value.clear();
    await loadLines();
  } finally {
    loading.value = false;
  }
};

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    setError('已复制到剪贴板');
    setTimeout(() => clearError(), 1200);
  } catch {
    setError('复制失败，请手动复制');
  }
};

const batchMerge = () => {
  const selected = filteredLines.value.filter((line) => selectedIds.value.has(line.id));
  if (selected.length === 0) {
    setError('请先选择线路');
    return;
  }
  const text = selected
    .map((line) => `${line.entry_domain} -> ${line.fast_domain} -> ${line.origin_domain}`)
    .join('\n');
  copyText(text);
};

onMounted(() => {
  if (password.value.trim()) {
    login();
  }
});
</script>

<template>
  <div class="app" :class="{ 'app--login': !authed }">
    <section v-if="!authed" class="login">
      <div class="login-card">
        <p class="eyebrow">CF 优选反代</p>
        <h1>登录管理台</h1>
        <p class="sub">请输入部署时设置的 `ADMIN_PASSWORD`。</p>
        <div class="field">
          <label>管理密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="ADMIN_PASSWORD"
            @keydown.enter.prevent="login"
          />
        </div>
        <button class="primary" @click="login" :disabled="loading">进入</button>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </section>

    <section v-else class="dashboard">
      <header class="header">
        <div>
          <p class="eyebrow">Emby 反代优选</p>
          <h1>线路管理中心</h1>
          <p class="sub">优选域名 + 回源域名组合，让访问速度更稳定。</p>
        </div>
      </header>

      <div class="controls">
        <div class="search">
          <input v-model="search" placeholder="搜索线路名称 / 域名 / 备注" />
        </div>
        <div class="filters">
          <input v-model="tagFilter" placeholder="按标签过滤 (单个标签)" />
          <select v-model="sortBy">
            <option value="weight">按权重</option>
            <option value="name">按名称</option>
            <option value="updated">按更新时间</option>
          </select>
          <select v-model="sortDir">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
          <label class="toggle">
            <input v-model="showEnabledOnly" type="checkbox" />
            仅显示启用
          </label>
        </div>
      </div>

      <div class="layout">
        <aside class="side">
          <div class="card panel">
            <div class="panel-header">
              <h2>{{ form.id ? '编辑线路' : '新增线路' }}</h2>
              <button class="ghost" @click="resetForm" :disabled="loading">清空</button>
            </div>
            <div class="field">
              <label>线路名称</label>
              <input v-model="form.name" placeholder="例如 东京优化线" />
            </div>
            <div class="field">
              <label>访问域名</label>
              <input v-model="form.entry_domain" placeholder="emby.example.com" />
            </div>
            <div class="field">
              <label>回源域名</label>
              <input v-model="form.origin_domain" placeholder="origin.example.com" />
            </div>
            <div class="field">
              <label>优选域名</label>
              <select v-model="form.fast_domain" @change="handleFastDomainChange(form.fast_domain)">
                <option
                  v-for="item in fastDomains"
                  :key="item.id"
                  :value="item.domain"
                >
                  {{ item.label ? `${item.label} (${item.domain})` : item.domain }}
                </option>
                <option :value="CUSTOM_FAST_DOMAIN_VALUE">自定义</option>
              </select>
              <input
                v-if="form.fast_domain === CUSTOM_FAST_DOMAIN_VALUE"
                v-model="customFastDomain"
                placeholder="自定义优选域名"
              />
            </div>
            <div class="field-inline">
              <div class="field">
                <label>权重</label>
                <input v-model.number="form.weight" type="number" min="0" />
              </div>
              <label class="toggle">
                <input v-model="form.enabled" type="checkbox" />
                启用
              </label>
            </div>
            <div class="field">
              <label>标签</label>
              <input v-model="form.tags" placeholder="CN,JP,专线" />
            </div>
            <div class="field">
              <label>备注</label>
              <textarea v-model="form.notes" rows="3" placeholder="说明或测速结果"></textarea>
            </div>
            <button class="primary" @click="saveLine" :disabled="loading">
              {{ form.id ? '保存修改' : '新增线路' }}
            </button>
          </div>
        </aside>

        <main class="main">
          <div class="batch-bar">
            <label class="toggle">
              <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />
              全选
            </label>
            <span class="meta">已选 {{ selectedCount }} 条</span>
            <button class="ghost" @click="batchMerge">批量整合</button>
            <button class="ghost" @click="batchUpdate({ enabled: 1 })">批量启用</button>
            <button class="ghost" @click="batchUpdate({ enabled: 0 })">批量停用</button>
            <button class="danger" @click="batchDelete">批量删除</button>
            <button class="ghost" @click="clearSelection">清空选择</button>
          </div>

          <div v-if="filteredLines.length === 0" class="empty">
            还没有线路数据，先在左侧新增。
          </div>

          <div v-else class="card-grid">
            <article
              v-for="line in filteredLines"
              :key="line.id"
              class="card line-card"
              :class="{ inactive: line.enabled !== 1 }"
            >
              <header class="line-header">
                <div class="line-title">
                  <input
                    type="checkbox"
                    :checked="selectedIds.has(line.id)"
                    @change="() => toggleSelect(line.id)"
                  />
                  <h3>{{ line.name }}</h3>
                </div>
                <button class="pill" @click="toggleEnabled(line)">
                  {{ line.enabled === 1 ? '启用' : '停用' }}
                </button>
              </header>
              <div class="line-body">
                <div>
                  <span class="label">访问域名</span>
                  <p class="mono">{{ line.entry_domain }}</p>
                </div>
                <div>
                  <span class="label">优选域名</span>
                  <p class="mono">{{ line.fast_domain }}</p>
                </div>
                <div>
                  <span class="label">回源域名</span>
                  <p class="mono">{{ line.origin_domain }}</p>
                </div>
              </div>
              <div class="line-meta">
                <span class="tag">权重 {{ line.weight }}</span>
                <span v-if="line.tags" class="tag">{{ line.tags }}</span>
                <span v-if="line.notes" class="meta">{{ line.notes }}</span>
              </div>
              <footer class="line-actions">
                <button class="ghost" @click="editLine(line)">编辑</button>
                <button
                  class="ghost"
                  @click="copyText(line.entry_domain)"
                  title="复制访问域名"
                >
                  复制访问域名
                </button>
                <button class="danger" @click="removeLine(line)">删除</button>
              </footer>
            </article>
          </div>
        </main>
      </div>

      <footer class="footer">
        <span>部署到 Cloudflare Workers + D1</span>
        <span v-if="error" class="error">{{ error }}</span>
      </footer>
    </section>
  </div>
</template>
