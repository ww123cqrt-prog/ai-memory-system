import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersonaGenerator } from '../vendor/tencentdb/src/core/persona/persona-generator.js';
import { formatSceneBlock } from '../vendor/tencentdb/src/core/scene/scene-format.js';
import { syncSceneIndex } from '../vendor/tencentdb/src/core/scene/scene-index.js';

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const dataDir = await mkdtemp(join(tmpdir(), 'memory-persona-fallback-'));

try {
  const sceneDir = join(dataDir, 'scene_blocks');
  await mkdir(sceneDir, { recursive: true });
  await writeFile(
    join(sceneDir, 'codex-memory-workflow.md'),
    formatSceneBlock(
      {
        created: '2026-06-09T08:00:00.000Z',
        updated: '2026-06-09T08:00:00.000Z',
        summary: 'The user wants layered memory processing to run automatically and verifiably.',
        heat: 2,
      },
      '## 用户偏好\n\n用户要求 L0 自动进入 L1/L2/L3，并要求本地验证、常驻运行和 GitHub 推送。',
    ),
    'utf-8',
  );
  await syncSceneIndex(dataDir);

  let promptSeen = '';
  const generator = new PersonaGenerator({
    dataDir,
    config: {},
    logger,
    llmRunner: {
      supportsFileTools: false,
      async run(params) {
        assert.equal(params.workspaceDir, undefined);
        assert.equal(params.maxTokens, 2048);
        promptSeen = params.prompt;
        return [
          '```markdown',
          '# User Narrative Profile',
          '',
          '> **Archetype (核心原型)**: 严谨的本地工作流维护者。',
          '',
          '## Chapter 1: Context & Current State',
          '用户关注本地记忆系统的分层处理、可验证运行和长期维护。',
          '```',
        ].join('\n');
      },
    },
  });

  const updated = await generator.generateLocalPersona('test fallback');
  assert.equal(updated, true);
  assert.match(promptSeen, /You do not have file tools/);

  const persona = await readFile(join(dataDir, 'persona.md'), 'utf-8');
  assert.match(persona, /^# User Narrative Profile/m);
  assert.doesNotMatch(persona, /```markdown/);
  assert.match(persona, /codex-memory-workflow\.md/);
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
