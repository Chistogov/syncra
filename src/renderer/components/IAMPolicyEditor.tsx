import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Code,
  Sliders,
  Plus,
  Trash2,
  Shield,
  Check,
  Copy,
  AlertCircle,
  Sparkles,
  Folder,
  Globe,
  Lock,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Wand2,
  FileCode,
} from 'lucide-react';
import { S3Bucket } from '../../common/types';

export interface IAMPolicyEditorProps {
  value: string;
  onChange: (newValue: string) => void;
  buckets: S3Bucket[];
  theme: 'dark' | 'light';
  readOnly?: boolean;
}

// Definition of standard S3 and MinIO actions
interface ActionDefinition {
  id: string;
  name: string;
  desc: string;
  isObjectAction?: boolean;
  isBucketAction?: boolean;
}

interface ActionCategory {
  title: string;
  icon?: string;
  actions: ActionDefinition[];
}

const ACTION_CATEGORIES: ActionCategory[] = [
  {
    title: 'Чтение и скачивание (Object Read)',
    actions: [
      { id: 's3:GetObject', name: 'GetObject', desc: 'Скачивание и чтение содержимого файлов', isObjectAction: true },
      { id: 's3:GetObjectVersion', name: 'GetObjectVersion', desc: 'Чтение предыдущих версий файлов', isObjectAction: true },
      { id: 's3:GetObjectTagging', name: 'GetObjectTagging', desc: 'Просмотр тегов объекта', isObjectAction: true },
      { id: 's3:GetObjectAcl', name: 'GetObjectAcl', desc: 'Просмотр прав доступа (ACL) к объекту', isObjectAction: true },
    ],
  },
  {
    title: 'Загрузка и запись (Object Write)',
    actions: [
      { id: 's3:PutObject', name: 'PutObject', desc: 'Загрузка и перезапись файлов, создание папок', isObjectAction: true },
      { id: 's3:PutObjectTagging', name: 'PutObjectTagging', desc: 'Установка и изменение тегов объектов', isObjectAction: true },
      { id: 's3:AbortMultipartUpload', name: 'AbortMultipartUpload', desc: 'Прерывание составных загрузок', isObjectAction: true },
      { id: 's3:PutObjectAcl', name: 'PutObjectAcl', desc: 'Изменение ACL объекта', isObjectAction: true },
    ],
  },
  {
    title: 'Удаление (Object Delete)',
    actions: [
      { id: 's3:DeleteObject', name: 'DeleteObject', desc: 'Удаление файлов и маркеров', isObjectAction: true },
      { id: 's3:DeleteObjectVersion', name: 'DeleteObjectVersion', desc: 'Безвозвратное удаление конкретной версии файла', isObjectAction: true },
      { id: 's3:DeleteObjectTagging', name: 'DeleteObjectTagging', desc: 'Удаление тегов объекта', isObjectAction: true },
    ],
  },
  {
    title: 'Листинг и навигация по бакетам (Bucket Listing)',
    actions: [
      { id: 's3:ListBucket', name: 'ListBucket', desc: 'Просмотр содержимого бакета и каталогов (обязательно для навигации)', isBucketAction: true },
      { id: 's3:ListBucketVersions', name: 'ListBucketVersions', desc: 'Просмотр истории версий в бакете', isBucketAction: true },
      { id: 's3:ListAllMyBuckets', name: 'ListAllMyBuckets', desc: 'Просмотр списка всех бакетов аккаунта', isBucketAction: true },
      { id: 's3:GetBucketLocation', name: 'GetBucketLocation', desc: 'Определение региона бакета', isBucketAction: true },
      { id: 's3:ListBucketMultipartUploads', name: 'ListBucketMultipartUploads', desc: 'Просмотр активных составных загрузок', isBucketAction: true },
    ],
  },
  {
    title: 'Управление бакетами (Bucket Administration)',
    actions: [
      { id: 's3:CreateBucket', name: 'CreateBucket', desc: 'Создание новых бакетов', isBucketAction: true },
      { id: 's3:DeleteBucket', name: 'DeleteBucket', desc: 'Удаление пустых бакетов', isBucketAction: true },
      { id: 's3:GetBucketPolicy', name: 'GetBucketPolicy', desc: 'Чтение политики доступа бакета', isBucketAction: true },
      { id: 's3:PutBucketPolicy', name: 'PutBucketPolicy', desc: 'Изменение политики доступа бакета', isBucketAction: true },
      { id: 's3:GetBucketVersioning', name: 'GetBucketVersioning', desc: 'Просмотр статуса версионирования', isBucketAction: true },
      { id: 's3:PutBucketVersioning', name: 'PutBucketVersioning', desc: 'Включение или приостановка версионирования', isBucketAction: true },
    ],
  },
  {
    title: 'Администрирование MinIO (MinIO Cluster)',
    actions: [
      { id: 'admin:*', name: 'admin:*', desc: 'Полные административные права MinIO' },
      { id: 'admin:ServerInfo', name: 'admin:ServerInfo', desc: 'Диагностика и просмотр дисков/узлов' },
      { id: 'admin:ListUsers', name: 'admin:ListUsers', desc: 'Просмотр списка пользователей' },
      { id: 'admin:CreateUser', name: 'admin:CreateUser', desc: 'Создание пользователей MinIO' },
      { id: 'admin:ListPolicies', name: 'admin:ListPolicies', desc: 'Просмотр политик доступа' },
    ],
  },
];

interface VisualStatement {
  sid: string;
  effect: 'Allow' | 'Deny';
  actions: string[];
  scope: 'all' | 'bucket' | 'folder' | 'custom';
  selectedBucket: string;
  folderPrefix: string;
  customResources: string;
  requireHttps: boolean;
  ipRestriction: string;
}

export const IAMPolicyEditor: React.FC<IAMPolicyEditorProps> = ({
  value,
  onChange,
  buckets,
  theme,
  readOnly = false,
}) => {
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [parseError, setParseError] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Parse raw JSON value into VisualStatements
  const parseJsonToStatements = useCallback(
    (jsonStr: string): { statements: VisualStatement[]; error: string | null } => {
      if (!jsonStr || !jsonStr.trim()) {
        return {
          statements: [
            {
              sid: 'Statement1',
              effect: 'Allow',
              actions: ['s3:GetObject', 's3:ListBucket'],
              scope: 'all',
              selectedBucket: buckets[0]?.name || '',
              folderPrefix: '',
              customResources: '',
              requireHttps: false,
              ipRestriction: '',
            },
          ],
          error: null,
        };
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const rawStatements = Array.isArray(parsed.Statement) ? parsed.Statement : [parsed.Statement].filter(Boolean);

        const visualList: VisualStatement[] = rawStatements.map((st: any, idx: number) => {
          const sid = st.Sid || `Statement_${idx + 1}`;
          const effect = st.Effect === 'Deny' ? 'Deny' : 'Allow';

          // Actions
          let actions: string[] = [];
          if (Array.isArray(st.Action)) {
            actions = st.Action.map(String);
          } else if (typeof st.Action === 'string') {
            actions = [st.Action];
          }

          // Resources
          let resources: string[] = [];
          if (Array.isArray(st.Resource)) {
            resources = st.Resource.map(String);
          } else if (typeof st.Resource === 'string') {
            resources = [st.Resource];
          }

          // Scope inference
          let scope: 'all' | 'bucket' | 'folder' | 'custom' = 'all';
          let selectedBucket = buckets[0]?.name || '';
          let folderPrefix = '';
          let customResources = '';

          const isAllWildcard = resources.some((r) => r === '*' || r === 'arn:aws:s3:::*' || r === 'arn:aws:s3:::*/*');

          if (isAllWildcard) {
            scope = 'all';
          } else if (resources.length > 0) {
            // Check if matches a bucket pattern
            let matchedBucket = '';
            let matchedPrefix = '';

            for (const r of resources) {
              const m = r.match(/^arn:aws:s3:::([^/*]+)(?:\/(.*))?$/);
              if (m) {
                matchedBucket = m[1];
                if (m[2] && m[2] !== '*') {
                  matchedPrefix = m[2].replace(/\*$/, '');
                }
              }
            }

            if (matchedBucket) {
              selectedBucket = matchedBucket;
              if (matchedPrefix) {
                scope = 'folder';
                folderPrefix = matchedPrefix;
              } else {
                scope = 'bucket';
              }
            } else {
              scope = 'custom';
              customResources = resources.join('\n');
            }
          }

          // Conditions
          let requireHttps = false;
          let ipRestriction = '';

          if (st.Condition) {
            if (st.Condition.Bool && (st.Condition.Bool['aws:SecureTransport'] === 'true' || st.Condition.Bool['aws:SecureTransport'] === true)) {
              requireHttps = true;
            }
            if (st.Condition.IpAddress && st.Condition.IpAddress['aws:SourceIp']) {
              const ipVal = st.Condition.IpAddress['aws:SourceIp'];
              ipRestriction = Array.isArray(ipVal) ? ipVal.join(', ') : String(ipVal);
            }
          }

          return {
            sid,
            effect,
            actions,
            scope,
            selectedBucket,
            folderPrefix,
            customResources,
            requireHttps,
            ipRestriction,
          };
        });

        return { statements: visualList, error: null };
      } catch (err: any) {
        return { statements: [], error: err.message || 'Ошибка синтаксиса JSON' };
      }
    },
    [buckets]
  );

  // Statements state
  const [statements, setStatements] = useState<VisualStatement[]>(() => {
    return parseJsonToStatements(value).statements;
  });

  // When value prop updates externally, re-parse if in visual mode
  useEffect(() => {
    const { statements: parsedList, error } = parseJsonToStatements(value);
    setParseError(error);
    if (!error && parsedList.length > 0) {
      setStatements(parsedList);
    }
  }, [value, parseJsonToStatements]);

  // Generate clean JSON from VisualStatements
  const generateJson = useCallback((stList: VisualStatement[]): string => {
    const formattedStatements = stList.map((st) => {
      // 1. Actions
      let actions = st.actions.length > 0 ? st.actions : ['s3:GetObject'];
      if (actions.includes('s3:*')) {
        actions = ['s3:*'];
      }

      // 2. Resources
      let resources: string[] = [];
      if (st.scope === 'all') {
        resources = ['arn:aws:s3:::*'];
      } else if (st.scope === 'bucket' && st.selectedBucket) {
        resources = [`arn:aws:s3:::${st.selectedBucket}`, `arn:aws:s3:::${st.selectedBucket}/*`];
      } else if (st.scope === 'folder' && st.selectedBucket) {
        const cleanPfx = (st.folderPrefix || '').replace(/^\/+|\/+$/g, '');
        resources = [`arn:aws:s3:::${st.selectedBucket}`, `arn:aws:s3:::${st.selectedBucket}/${cleanPfx}/*`];
      } else if (st.scope === 'custom') {
        resources = st.customResources
          .split('\n')
          .map((r) => r.trim())
          .filter(Boolean);
        if (resources.length === 0) resources = ['arn:aws:s3:::*'];
      }

      const outSt: any = {
        Sid: st.sid || undefined,
        Effect: st.effect,
        Action: actions.length === 1 ? actions[0] : actions,
        Resource: resources.length === 1 ? resources[0] : resources,
      };

      // 3. Conditions
      const conditionObj: any = {};
      if (st.requireHttps) {
        conditionObj.Bool = { 'aws:SecureTransport': 'true' };
      }
      if (st.ipRestriction && st.ipRestriction.trim()) {
        const ips = st.ipRestriction
          .split(',')
          .map((ip) => ip.trim())
          .filter(Boolean);
        conditionObj.IpAddress = { 'aws:SourceIp': ips.length === 1 ? ips[0] : ips };
      }

      if (Object.keys(conditionObj).length > 0) {
        outSt.Condition = conditionObj;
      }

      return outSt;
    });

    const doc = {
      Version: '2012-10-17',
      Statement: formattedStatements,
    };

    return JSON.stringify(doc, null, 2);
  }, []);

  // Update a single statement in visual list and emit JSON
  const updateStatement = (index: number, updater: (prev: VisualStatement) => VisualStatement) => {
    setStatements((prev) => {
      const next = prev.slice();
      next[index] = updater(next[index]);
      const json = generateJson(next);
      onChange(json);
      return next;
    });
  };

  // Add new statement
  const handleAddStatement = () => {
    setStatements((prev) => {
      const next: VisualStatement[] = [
        ...prev,
        {
          sid: `Statement_${prev.length + 1}`,
          effect: 'Allow',
          actions: ['s3:GetObject', 's3:ListBucket'],
          scope: 'all',
          selectedBucket: buckets[0]?.name || '',
          folderPrefix: '',
          customResources: '',
          requireHttps: false,
          ipRestriction: '',
        },
      ];
      const json = generateJson(next);
      onChange(json);
      return next;
    });
  };

  // Delete statement
  const handleDeleteStatement = (index: number) => {
    if (statements.length <= 1) {
      alert('Политика должна содержать как минимум одно правило (Statement)');
      return;
    }
    setStatements((prev) => {
      const next = prev.filter((_, i) => i !== index);
      const json = generateJson(next);
      onChange(json);
      return next;
    });
  };

  // Preset Handlers
  const applyPreset = (presetKey: string) => {
    let newDoc: any = null;
    const targetBucket = buckets[0]?.name || 'my-bucket';

    switch (presetKey) {
      case 'readwrite':
        newDoc = {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'FullAccessS3',
              Effect: 'Allow',
              Action: ['s3:*'],
              Resource: ['arn:aws:s3:::*'],
            },
          ],
        };
        break;
      case 'readonly':
        newDoc = {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'ReadOnlyS3',
              Effect: 'Allow',
              Action: ['s3:GetObject', 's3:ListBucket', 's3:GetBucketLocation', 's3:ListAllMyBuckets'],
              Resource: ['arn:aws:s3:::*'],
            },
          ],
        };
        break;
      case 'dropbox':
        newDoc = {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'DropBoxWriteOnly',
              Effect: 'Allow',
              Action: ['s3:PutObject', 's3:AbortMultipartUpload'],
              Resource: [`arn:aws:s3:::${targetBucket}/*`],
            },
            {
              Sid: 'ListBucketForUpload',
              Effect: 'Allow',
              Action: ['s3:ListBucket'],
              Resource: [`arn:aws:s3:::${targetBucket}`],
            },
          ],
        };
        break;
      case 'bucket_restricted':
        newDoc = {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'BucketSpecificAccess',
              Effect: 'Allow',
              Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
              Resource: [`arn:aws:s3:::${targetBucket}/*`],
            },
            {
              Sid: 'BucketListing',
              Effect: 'Allow',
              Action: ['s3:ListBucket', 's3:GetBucketLocation'],
              Resource: [`arn:aws:s3:::${targetBucket}`],
            },
          ],
        };
        break;
      case 'public_read':
        newDoc = {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'PublicReadGetObject',
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${targetBucket}/*`],
            },
          ],
        };
        break;
      case 'admin':
        newDoc = {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'AdminFullAccess',
              Effect: 'Allow',
              Action: ['admin:*', 's3:*'],
              Resource: ['arn:aws:s3:::*'],
            },
          ],
        };
        break;
      default:
        return;
    }

    const json = JSON.stringify(newDoc, null, 2);
    onChange(json);
    const { statements: pList } = parseJsonToStatements(json);
    setStatements(pList);
  };

  // Toggle mode with error validation
  const handleToggleMode = (targetMode: 'visual' | 'code') => {
    if (targetMode === 'visual') {
      const { statements: pList, error } = parseJsonToStatements(value);
      if (error) {
        alert(`Невозможно переключить в интерактивный режим из-за синтаксической ошибки в JSON:\n\n${error}`);
        return;
      }
      setStatements(pList);
    }
    setMode(targetMode);
  };

  // Quick Action Preset Buttons per statement
  const setQuickActions = (idx: number, type: 'all' | 'read' | 'write' | 'delete' | 'admin') => {
    updateStatement(idx, (prev) => {
      let nextActions: string[] = [];
      if (type === 'all') nextActions = ['s3:*'];
      else if (type === 'read') nextActions = ['s3:GetObject', 's3:ListBucket', 's3:GetBucketLocation'];
      else if (type === 'write') nextActions = ['s3:PutObject', 's3:AbortMultipartUpload'];
      else if (type === 'delete') nextActions = ['s3:DeleteObject'];
      else if (type === 'admin') nextActions = ['admin:*', 's3:*'];
      return { ...prev, actions: nextActions };
    });
  };

  // Toggle single action checkbox
  const toggleAction = (idx: number, actionId: string) => {
    updateStatement(idx, (prev) => {
      let nextActions = prev.actions.filter((a) => a !== 's3:*' && a !== 'admin:*');
      if (prev.actions.includes(actionId)) {
        nextActions = nextActions.filter((a) => a !== actionId);
      } else {
        nextActions.push(actionId);
      }
      if (nextActions.length === 0) {
        nextActions = ['s3:GetObject'];
      }
      return { ...prev, actions: nextActions };
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-plane-surface border border-border rounded-xl overflow-hidden shadow-xs select-none">
      {/* Top Header / Mode Switcher Toolbar */}
      <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          {/* Mode Switch Tabs */}
          <div className="flex items-center space-x-1 bg-plane-bg border border-border p-0.5 rounded-lg">
            <button
              onClick={() => handleToggleMode('visual')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                mode === 'visual'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Интерактивный</span>
            </button>

            <button
              onClick={() => handleToggleMode('code')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                mode === 'code'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Текстовый (JSON)</span>
            </button>
          </div>

          {/* Syntax Error Warning Badge */}
          {parseError && (
            <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/25 text-rose-300 text-[11px] flex items-center space-x-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span className="truncate max-w-xs">{parseError}</span>
            </span>
          )}
        </div>

        {/* Presets Dropdown */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 text-xs text-muted-foreground">
            <Wand2 className="w-3.5 h-3.5 text-primary" />
            <span>Шаблоны:</span>
          </div>

          <select
            onChange={(e) => {
              if (e.target.value) {
                applyPreset(e.target.value);
                e.target.value = '';
              }
            }}
            defaultValue=""
            disabled={readOnly}
            className="px-2.5 py-1 bg-plane-bg border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none focus:border-primary"
          >
            <option value="" disabled>
              Применить готовый шаблон...
            </option>
            <option value="readwrite">Полный доступ (Full S3 readwrite)</option>
            <option value="readonly">Только чтение (ReadOnly S3)</option>
            <option value="dropbox">Загрузка без чтения (DropBox / Write-Only)</option>
            <option value="bucket_restricted">Ограничить доступ одним бакетом</option>
            <option value="public_read">Публичное чтение (Public Read)</option>
            <option value="admin">Администратор сервера (MinIO Admin)</option>
          </select>
        </div>
      </div>

      {/* Editor Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {/* MODE 1: VISUAL INTERACTIVE BUILDER */}
        {mode === 'visual' && (
          <div className="h-full overflow-y-auto p-5 space-y-5">
            {statements.map((st, idx) => (
              <div
                key={idx}
                className="bg-plane-bg border border-border rounded-xl p-4.5 space-y-4 shadow-xs relative transition-all"
              >
                {/* Statement Header */}
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>

                    {/* SID (Statement ID) */}
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-semibold text-foreground">Правило:</span>
                      <input
                        type="text"
                        value={st.sid}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateStatement(idx, (p) => ({ ...p, sid: e.target.value }))
                        }
                        placeholder="Statement_ID"
                        className="px-2 py-0.5 bg-plane-surface border border-border rounded text-xs font-mono text-foreground focus:outline-none focus:border-primary w-40"
                      />
                    </div>

                    {/* Effect Selector (Allow / Deny) */}
                    <div className="flex items-center space-x-1 bg-plane-surface border border-border p-0.5 rounded-lg">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() =>
                          updateStatement(idx, (p) => ({ ...p, effect: 'Allow' }))
                        }
                        className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          st.effect === 'Allow'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Разрешить
                      </button>

                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() =>
                          updateStatement(idx, (p) => ({ ...p, effect: 'Deny' }))
                        }
                        className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          st.effect === 'Deny'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Запретить
                      </button>
                    </div>
                  </div>

                  {/* Delete Statement */}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleDeleteStatement(idx)}
                      className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Удалить это правило"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Section 1: Actions Selection */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                      <Shield className="w-3.5 h-3.5 text-primary" />
                      <span>Разрешённые действия</span>
                    </span>

                    {/* Quick Action Presets */}
                    <div className="flex items-center space-x-1">
                      <span className="text-[10px] text-muted-foreground mr-1">Быстрый выбор:</span>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setQuickActions(idx, 'all')}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                          st.actions.includes('s3:*')
                            ? 'bg-primary text-primary-foreground border-primary font-bold'
                            : 'bg-plane-surface border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        s3:* (Всё)
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setQuickActions(idx, 'read')}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-plane-surface border border-border text-muted-foreground hover:text-foreground"
                      >
                        Чтение
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setQuickActions(idx, 'write')}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-plane-surface border border-border text-muted-foreground hover:text-foreground"
                      >
                        Запись
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setQuickActions(idx, 'delete')}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-plane-surface border border-border text-muted-foreground hover:text-foreground"
                      >
                        Удаление
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setQuickActions(idx, 'admin')}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-plane-surface border border-border text-muted-foreground hover:text-foreground"
                      >
                        admin:*
                      </button>
                    </div>
                  </div>

                  {/* Actions Accordion Categories */}
                  <div className="space-y-1.5 border border-border/80 rounded-lg p-2.5 bg-plane-surface/50">
                    {ACTION_CATEGORIES.map((cat, catIdx) => {
                      const isCollapsed = collapsedCategories[`${idx}_${catIdx}`];
                      const selectedCount = cat.actions.filter((a) =>
                        st.actions.includes(a.id) || st.actions.includes('s3:*') || st.actions.includes('admin:*')
                      ).length;

                      return (
                        <div key={cat.title} className="border border-border/60 rounded-lg overflow-hidden bg-plane-surface">
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedCategories((prev) => ({
                                ...prev,
                                [`${idx}_${catIdx}`]: !prev[`${idx}_${catIdx}`],
                              }))
                            }
                            className="w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
                          >
                            <span className="text-xs font-medium text-foreground flex items-center space-x-1.5">
                              {isCollapsed ? (
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                              <span>{cat.title}</span>
                            </span>

                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                              {selectedCount} / {cat.actions.length}
                            </span>
                          </button>

                          {!isCollapsed && (
                            <div className="p-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-2 border-t border-border/40">
                              {cat.actions.map((act) => {
                                const isChecked =
                                  st.actions.includes(act.id) ||
                                  (st.actions.includes('s3:*') && act.id.startsWith('s3:')) ||
                                  (st.actions.includes('admin:*') && act.id.startsWith('admin:'));

                                return (
                                  <label
                                    key={act.id}
                                    className={`flex items-start space-x-2 p-1.5 rounded cursor-pointer transition-colors ${
                                      isChecked
                                        ? 'bg-primary/10 border border-primary/20 text-foreground'
                                        : 'hover:bg-muted/40 text-muted-foreground'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={readOnly || st.actions.includes('s3:*') || st.actions.includes('admin:*')}
                                      checked={isChecked}
                                      onChange={() => toggleAction(idx, act.id)}
                                      className="mt-0.5 rounded text-primary focus:ring-0 focus:ring-offset-0 border-border"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-mono font-semibold text-foreground truncate">
                                        {act.name}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground leading-tight truncate">
                                        {act.desc}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Resources Selection */}
                <div className="space-y-2.5">
                  <span className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                    <Folder className="w-3.5 h-3.5 text-primary" />
                    <span>Целевые ресурсы</span>
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    {/* Option: All Buckets */}
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => updateStatement(idx, (p) => ({ ...p, scope: 'all' }))}
                      className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                        st.scope === 'all'
                          ? 'bg-primary/10 border-primary text-foreground shadow-xs'
                          : 'bg-plane-surface border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 text-xs font-semibold">
                        <Globe className="w-3.5 h-3.5" />
                        <span>Все бакеты</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground mt-1">
                        arn:aws:s3:::*
                      </span>
                    </button>

                    {/* Option: Specific Bucket */}
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => updateStatement(idx, (p) => ({ ...p, scope: 'bucket' }))}
                      className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                        st.scope === 'bucket'
                          ? 'bg-primary/10 border-primary text-foreground shadow-xs'
                          : 'bg-plane-surface border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 text-xs font-semibold">
                        <Folder className="w-3.5 h-3.5" />
                        <span>Конкретный бакет</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                        {st.selectedBucket || 'Выберите бакет'}
                      </span>
                    </button>

                    {/* Option: Specific Folder */}
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => updateStatement(idx, (p) => ({ ...p, scope: 'folder' }))}
                      className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                        st.scope === 'folder'
                          ? 'bg-primary/10 border-primary text-foreground shadow-xs'
                          : 'bg-plane-surface border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 text-xs font-semibold">
                        <Folder className="w-3.5 h-3.5" />
                        <span>Подпапка в бакете</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                        {st.folderPrefix ? `/${st.folderPrefix}/*` : 'Любая подпапка'}
                      </span>
                    </button>

                    {/* Option: Custom ARN */}
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => updateStatement(idx, (p) => ({ ...p, scope: 'custom' }))}
                      className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                        st.scope === 'custom'
                          ? 'bg-primary/10 border-primary text-foreground shadow-xs'
                          : 'bg-plane-surface border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 text-xs font-semibold">
                        <Code className="w-3.5 h-3.5" />
                        <span>Произвольный ARN</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground mt-1">
                        Ввести вручную
                      </span>
                    </button>
                  </div>

                  {/* Sub-options for Bucket / Folder Selection */}
                  {(st.scope === 'bucket' || st.scope === 'folder') && (
                    <div className="p-3 rounded-lg border border-border bg-plane-surface flex flex-wrap items-center gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                          Целевой бакет:
                        </label>
                        <select
                          value={st.selectedBucket}
                          disabled={readOnly}
                          onChange={(e) =>
                            updateStatement(idx, (p) => ({ ...p, selectedBucket: e.target.value }))
                          }
                          className="px-2.5 py-1 bg-plane-bg border border-border rounded text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                        >
                          {buckets.map((b) => (
                            <option key={b.name} value={b.name}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {st.scope === 'folder' && (
                        <div className="flex-1 min-w-[200px]">
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                            Ограничить префиксом/папкой (например, `reports/` или `users/john/`):
                          </label>
                          <input
                            type="text"
                            value={st.folderPrefix}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateStatement(idx, (p) => ({ ...p, folderPrefix: e.target.value }))
                            }
                            placeholder="my-folder/"
                            className="w-full px-2.5 py-1 bg-plane-bg border border-border rounded text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {st.scope === 'custom' && (
                    <div className="p-3 rounded-lg border border-border bg-plane-surface">
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Введите список ARN ресурсов (по одному на строку):
                      </label>
                      <textarea
                        rows={2}
                        value={st.customResources}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateStatement(idx, (p) => ({ ...p, customResources: e.target.value }))
                        }
                        placeholder="arn:aws:s3:::my-bucket/*"
                        className="w-full p-2 bg-plane-bg border border-border rounded text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  )}
                </div>

                {/* Section 3: Conditions */}
                <div className="space-y-2 pt-1 border-t border-border/40">
                  <span className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                    <Lock className="w-3.5 h-3.5 text-primary" />
                    <span>Условия безопасности</span>
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-plane-surface">
                    {/* HTTPS Only */}
                    <label className="flex items-center space-x-2 text-xs cursor-pointer text-foreground">
                      <input
                        type="checkbox"
                        checked={st.requireHttps}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateStatement(idx, (p) => ({ ...p, requireHttps: e.target.checked }))
                        }
                        className="rounded text-primary focus:ring-0 focus:ring-offset-0 border-border"
                      />
                      <span>Требовать защищённое HTTPS соединение (`aws:SecureTransport`)</span>
                    </label>

                    {/* IP Restriction */}
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        Ограничение по IP:
                      </span>
                      <input
                        type="text"
                        value={st.ipRestriction}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateStatement(idx, (p) => ({ ...p, ipRestriction: e.target.value }))
                        }
                        placeholder="например, 192.168.1.0/24"
                        className="flex-1 px-2 py-1 bg-plane-bg border border-border rounded text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Add Statement Button */}
            {!readOnly && (
              <button
                type="button"
                onClick={handleAddStatement}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-border hover:border-primary text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center justify-center space-x-1.5 transition-colors bg-plane-bg/50"
              >
                <Plus className="w-4 h-4 text-primary" />
                <span>Добавить ещё одно правило</span>
              </button>
            )}
          </div>
        )}

        {/* MODE 2: CODE (MONACO JSON) EDITOR */}
        {mode === 'code' && (
          <div className="h-full relative">
            <Editor
              height="100%"
              language="json"
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              value={value}
              onChange={(val) => onChange(val || '')}
              options={{
                readOnly,
                minimap: { enabled: false },
                fontSize: 12,
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                automaticLayout: true,
                formatOnPaste: true,
                tabSize: 2,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
