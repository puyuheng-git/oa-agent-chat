<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { MagicStick, Plus, Refresh, Shop } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createSkillPack,
  deleteSkillPack,
  getSkillPackContent,
  installSkillMarket,
  listSkillMarket,
  listSkillPacks,
  publishSkillPack,
  setSkillPackEnabled,
  updateSkillPack,
  withdrawSkillPack,
  type SkillPackItem,
} from '../api'
import { errorMessage } from '../../shared/http'

const props = defineProps<{ active: boolean }>()

const tab = ref<'mine' | 'market'>('mine')
const loading = ref(false)
const mine = ref<SkillPackItem[]>([])
const market = ref<SkillPackItem[]>([])
const marketQ = ref('')

const editorOpen = ref(false)
const editingId = ref<number | null>(null)
const skillMd = ref('')
const saving = ref(false)

const DEFAULT_MD = `---
name: my-skill
description: 说明这个 Skill 做什么、何时使用（含关键词）
---

# 我的 Skill

## 使用说明

在此写给助手的步骤指引。
`

/** 系统包不在用户库展示（后端也会过滤；此处再防一层） */
const mineSorted = computed(() => mine.value.filter((p) => p.kind !== 'system'))

async function loadMine() {
  loading.value = true
  try {
    mine.value = (await listSkillPacks()).items
  } catch (e) {
    ElMessage.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function loadMarket() {
  loading.value = true
  try {
    market.value = (await listSkillMarket(marketQ.value)).items
  } catch (e) {
    ElMessage.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function refresh() {
  if (tab.value === 'mine') await loadMine()
  else await loadMarket()
}

function openCreate() {
  editingId.value = null
  skillMd.value = DEFAULT_MD
  editorOpen.value = true
}

async function openEdit(row: SkillPackItem) {
  if (row.kind === 'system' || row.origin === 'market_install') {
    ElMessage.info('系统包与市场安装包不可编辑正文，可启停')
    return
  }
  try {
    const r = await getSkillPackContent(row.id)
    editingId.value = row.id
    skillMd.value = r.skill_md
    editorOpen.value = true
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

async function save() {
  if (skillMd.value.trim().length < 10) {
    ElMessage.warning('请填写完整的 SKILL.md')
    return
  }
  saving.value = true
  try {
    if (editingId.value == null) {
      await createSkillPack(skillMd.value)
      ElMessage.success('已创建')
    } else {
      await updateSkillPack(editingId.value, skillMd.value)
      ElMessage.success('已保存')
    }
    editorOpen.value = false
    await loadMine()
  } catch (e) {
    ElMessage.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function toggle(row: SkillPackItem) {
  try {
    await setSkillPackEnabled(row.id, !row.enabled)
    row.enabled = !row.enabled
    ElMessage.success(row.enabled ? '已启用' : '已停用')
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

async function remove(row: SkillPackItem) {
  try {
    await ElMessageBox.confirm(`确定删除 Skill「${row.display_name}」？`, '删除', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteSkillPack(row.id)
    ElMessage.success('已删除')
    await loadMine()
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

async function publish(row: SkillPackItem) {
  let description = row.description || ''
  try {
    const r = await ElMessageBox.prompt('填写市场上展示的描述（对外说明）', `推到市场：${row.display_name}`, {
      inputValue: description,
      inputType: 'textarea',
      inputValidator: (v: string) => (v && v.trim().length >= 2) || '请填写至少 2 个字的描述',
      confirmButtonText: '发布',
    })
    description = String(r.value || '').trim()
  } catch {
    return
  }
  try {
    await publishSkillPack(row.id, description)
    ElMessage.success('已推到 Skill 市场')
    await loadMine()
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

async function withdraw(row: SkillPackItem) {
  try {
    await withdrawSkillPack(row.id)
    ElMessage.success('已从市场下架')
    await loadMine()
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

async function install(row: SkillPackItem) {
  try {
    await installSkillMarket(row.id)
    ElMessage.success('已添加到我的 Skill')
    await loadMarket()
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

watch(
  () => props.active,
  (v) => {
    if (v) void refresh()
  },
)

watch(tab, () => {
  if (props.active) void refresh()
})

onMounted(() => {
  if (props.active) void refresh()
})
</script>

<template>
  <section class="skills">
    <header class="head">
      <div>
        <h2>工作空间</h2>
        <p>仅展示你自己的 Skill（含对话里用「创建 Skill」自然语言生成的）。系统内置 Skill 由后台配置，自动进入对话，不在此列表。</p>
      </div>
      <div class="actions">
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建 Skill</el-button>
      </div>
    </header>

    <el-radio-group v-model="tab" size="small" class="tabs">
      <el-radio-button value="mine">
        <el-icon><MagicStick /></el-icon>
        我的 Skill
      </el-radio-button>
      <el-radio-button value="market">
        <el-icon><Shop /></el-icon>
        Skill 市场
      </el-radio-button>
    </el-radio-group>

    <div v-if="tab === 'market'" class="market-bar">
      <el-input
        v-model="marketQ"
        clearable
        placeholder="搜索市场 Skill"
        style="max-width: 280px"
        @keyup.enter="loadMarket"
      />
      <el-button @click="loadMarket">搜索</el-button>
    </div>

    <el-table v-loading="loading" :data="tab === 'mine' ? mineSorted : market" empty-text="暂无数据">
      <el-table-column label="Skill" min-width="220">
        <template #default="{ row }">
          <b>{{ row.display_name }}</b>
          <div class="muted">{{ row.name }} · {{ row.kind }} · {{ row.origin }}</div>
          <div class="muted">{{ row.description }}</div>
        </template>
      </el-table-column>
      <el-table-column v-if="tab === 'market'" label="市场描述" min-width="240">
        <template #default="{ row }">
          <div>{{ row.market_description || row.description || '—' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="调用" width="90" align="center">
        <template #default="{ row }">
          {{ row.market_invoke_count ?? row.invoke_count ?? 0 }}
        </template>
      </el-table-column>
      <el-table-column v-if="tab === 'mine'" label="启用" width="90">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" @click="toggle(row)" />
        </template>
      </el-table-column>
      <el-table-column v-if="tab === 'market'" label="发布者" width="120">
        <template #default="{ row }">{{ row.publisher_oa || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <template v-if="tab === 'mine'">
            <el-button
              v-if="row.kind !== 'system' && row.origin !== 'market_install'"
              link
              type="primary"
              @click="openEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="row.kind === 'user' && row.origin === 'created' && !row.listed"
              link
              type="success"
              @click="publish(row)"
            >
              推到市场
            </el-button>
            <el-button
              v-if="row.kind === 'user' && row.origin === 'created' && row.listed"
              link
              @click="withdraw(row)"
            >
              下架
            </el-button>
            <el-button
              v-if="row.kind === 'user' && row.origin === 'created'"
              link
              type="danger"
              @click="remove(row)"
            >
              删除
            </el-button>
          </template>
          <template v-else>
            <el-tag v-if="row.installed" size="small" type="success">已添加</el-tag>
            <el-button v-else link type="primary" @click="install(row)">添加到我的</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="editorOpen"
      :title="editingId ? '编辑 Skill' : '新建 Skill'"
      width="720px"
      :close-on-click-modal="false"
    >
      <p class="hint">使用 agentskills 格式：YAML frontmatter（name / description）+ Markdown 正文。内容保存在服务器。</p>
      <el-input v-model="skillMd" type="textarea" :rows="18" placeholder="SKILL.md" />
      <template #footer>
        <el-button @click="editorOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.skills {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px 28px;
  overflow: auto;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.head h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.head p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 8px;
}
.tabs {
  align-self: flex-start;
}
.market-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
