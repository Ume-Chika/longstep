# Longstep コードベース索引 (INDEX.md)

このドキュメントは、Longstepリポジトリの全体構造、各ファイルの責務、データ保存境界、および開発・検証コマンドを俯瞰するための索引です。
AIエージェントおよび開発者が、実装や不具合調査の着手時にコードベースを即座に把握するために活用します。

---

## 1. プロジェクト概要と大原則

- **目的**: 数ヶ月〜数年の長期目標をスモールステップ（現在地・中間目標・次の行動）へ分解し、可視化と見直しを支援する。
- **データ正本**: `~/Documents/Longstep/<計画ID>.json`（ローカルJSONファイル）。ユーザーとAIエージェントが同一正本を参照・更新する。
- **Web UIの責務**: 計画の可視化・編集・共通Pythonツールの配置と自動同期。サーバー送信や直接のLLM接続は行わない。
- **実装ルール**: **1ファイル原則200行以下**（コンポーネント・カスタムフック・型定義・定数へ適切に責務分離する）。

---

## 2. ファイル構成・責務マップ

### 2.1 ルート・エントリー
| ファイル | 役割・責務 | 行数目安 |
|:---|:---|:---|
| [`src/main.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/main.tsx) | Reactのエントリーポイント。ルート要素へのマウント | ~10行 |
| [`src/App.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/App.tsx) | アプリ全体のルートオーケストレーション。画面状態管理、各フックの初期化とレイアウト結合 | ~190行 |

### 2.2 画面コンポーネント (`src/components/screens/`)
| ファイル | 役割・責務 |
|:---|:---|
| [`HomeScreen.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/screens/HomeScreen.tsx) | ホーム画面。保存済み計画一覧、お気に入り、計画再開、削除、右クリックコンテキストメニュー |
| [`MapScreen.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/screens/MapScreen.tsx) | 計画マップ画面ラッパー。前後の計画への左右ボタン遷移、最終目標モーダル・HUD連携 |

### 2.3 モーダル (`src/components/modals/` & `AppModals.tsx`)
| ファイル | 役割・責務 |
|:---|:---|
| [`AppModals.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/AppModals.tsx) | アプリ内のモーダル表示制御ラッパー（作成・リネーム・ヘルプの集約） |
| [`CreatePlanModal.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/modals/CreatePlanModal.tsx) | 新規計画書作成モーダル。計画名、Longstep保存先フォルダ、プロジェクト設置先の指定 |
| [`FinalGoalModal.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/modals/FinalGoalModal.tsx) | 最終目標の詳細・編集モーダル。目標名、達成基準、期日、説明文の入力 |
| [`RenamePlanModal.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/modals/RenamePlanModal.tsx) | 計画名変更モーダル |
| [`HelpModal.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/modals/HelpModal.tsx) | 各ヘルプトピックの詳細説明モーダル |

### 2.4 計画マップ・共通UIコンポーネント (`src/components/`)
| ファイル | 役割・責務 |
|:---|:---|
| [`PlanMap.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/PlanMap.tsx) | 計画マップ描画コア（SVG/Canvas、ズームHUD、ノード/エッジ操作、表示設定ポップオーバー） |
| [`Header.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/Header.tsx) | グローバルヘッダー。画面切替、計画選択ドロップダウン、ヘルプメニュー |
| [`NoticeStack.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/NoticeStack.tsx) | 右下の通知メッセージトースト表示 |
| [`AchievementToast.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/AchievementToast.tsx) | 目標達成時の花火エフェクトとトースト |
| [`NodeSprite.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/NodeSprite.tsx) | マップノードのアイコン・スプライト描画 |
| [`ThemeCrest.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/ThemeCrest.tsx) | テーマクレスト描画 |
| [`backdropClose.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/backdropClose.ts) | モーダルの背景クリック・ドラッグ誤爆防止ハンドラー |
| [`planMapLogic.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/components/planMapLogic.ts) | マップレイアウト計算、自動整列、ノード挿入位置計算、ハイライト判定 |

### 2.5 カスタムフック (`src/hooks/`)
| フック名 | 役割・責務 |
|:---|:---|
| [`usePlanOperations.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/usePlanOperations.ts) | 中間目標（ノード）・道筋（エッジ）の追加・更新・削除・接続・位置入替 |
| [`usePlanStorage.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/usePlanStorage.ts) | File System Access API 保存先フォルダ選択・権限管理・削除・AI連携ファイル配置 |
| [`usePlanDraft.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/usePlanDraft.ts) | 計画名・期日・説明文・テーマの自動保存ドラフト管理 |
| [`usePlanPreferences.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/usePlanPreferences.ts) | スクロール位置、お気に入り、目標日付表記（締切り日／残り日数）の保存・読出 |
| [`usePlanNavigation.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/usePlanNavigation.ts) | 計画読み込み、画面遷移、前後の計画切替、外部競合エラーハンドリング |
| [`useCreatePlanModal.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/useCreatePlanModal.ts) | 計画作成フォームの状態管理とバリデーション |
| [`useRenamePlanModal.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/useRenamePlanModal.ts) | 計画名変更フォームの状態管理と更新実行 |
| [`useExternalSync.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/useExternalSync.ts) | Pythonツールの更新を1秒ごとに自動ポーリング検知して画面へ反映 |
| [`useKeyboardNavigation.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/useKeyboardNavigation.ts) | 左右矢印キーでの計画切替、Escキーでのモーダル/メニュー閉じ |
| [`useNotices.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/hooks/useNotices.ts) | 通知メッセージキューと自動消去タイマー |

### 2.6 サービス・ユーティリティ・定数
| ファイル | 役割・責務 |
|:---|:---|
| [`src/db/planStore.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/db/planStore.ts) | IndexedDB（`planMeta`）へのUI設定保存・読出、ファイル読み書きAPI |
| [`src/services/fileStorage.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/services/fileStorage.ts) | ディレクトリピッカー（Brave等の対応含む）、権限確認、ファイル書き込み |
| [`src/utils/graph.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/utils/graph.ts) | ノードID採番、循環依存チェック（DAG保証）、ノード削除時の道筋再接続 |
| [`src/utils/planFactory.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/utils/planFactory.ts) | 空計画生成、ランダム初期テーマ選択、エラーメッセージ整形 |
| [`src/schemas/planValidation.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/schemas/planValidation.ts) | 計画JSONのスキーマ定義、パースおよびバリデーション |
| [`src/python/entry.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/python/entry.ts) | AIエージェント用連携スクリプト（`longstep.py`）の自動生成テンプレート |
| [`src/constants/helpTopics.tsx`](file:///Users/umeda_chikara/Programs/web/longstep/src/constants/helpTopics.tsx) | ヘルプトピックの静的データ |
| [`src/types/app.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/types/app.ts) | アプリケーション共通のUI型定義（Screen, Notice, DateFormatなど） |
| [`src/models/plan.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/models/plan.ts) | 計画（PlanSnapshot）、目標（PlanNode）のデータ構造型定義 |
| [`src/models/theme.ts`](file:///Users/umeda_chikara/Programs/web/longstep/src/models/theme.ts) | 計画書カラーテーマの選択肢定義 |

---

## 3. データ保存先と境界ルール

| データ | 保存場所 | キー／識別子 | 担当モジュール |
|:---|:---|:---|:---|
| **計画正本データ** (`id`, `name`, `goal`, `nodes`, `meta`) | ローカル書類フォルダ (`~/Documents/Longstep/<計画ID>.json`) | `<計画ID>.json` | `src/db/planStore.ts` |
| **フォルダハンドル** | ブラウザ IndexedDB (`planMeta` ストア) | `__plan-directory-handle__` | `src/db/planStore.ts` |
| **直近に開いた計画ID** | ブラウザ IndexedDB (`planMeta` ストア) | `__last-opened-plan__` | `src/db/planStore.ts` |
| **サイト全体表示設定** (`dateFormat: 'deadline' \| 'remaining'`) | ブラウザ IndexedDB (`planMeta` ストア) | `__site-preferences__` | `usePlanPreferences.ts` |
| **計画個別表示設定** (`viewPosition`, `favorite`, `dateFormat`) | ブラウザ IndexedDB (`planMeta` ストア) | `<計画ID>` | `usePlanPreferences.ts` |

> [!IMPORTANT]
> 正本JSONにはUI表示用の計算値や個別設定を保存しません。IndexedDBと正本JSONの責務境界を厳守してください。

---

## 4. 開発・検証の定石コマンド

### 4.1 基本コマンド
```bash
# 開発サーバー起動 (デフォルト: http://localhost:5173/)
npm run dev

# 単体テスト実行 (Node.js組み込みテストランナー)
npm test

# 型検査 & 本番ビルド (GitHub Pages向け)
npm run build

# Linter実行 (oxlint)
npm run lint

# ファイル行数の一括確認 (200行以下ルールの監査)
wc -l src/**/*.ts src/**/*.tsx
```

### 4.2 実装・検証時の注意点
1. **実装前のブランチ作成**: まとまった機能は必ず `feature/<内容>`、不具合修正は `fix/<内容>` で作業する。
2. **行数監査**: 新規作成・修正したファイルが 200行以下に収まっているかを `wc -l` で確認する。
3. **ブラウザ自動検証**: ヘッドレスChromeで自動テストを行う際は、`npm run dev` がバックグラウンドで稼働していること、およびポート競合がないことを確認する。

---

## 5. Vault（要件・意思決定文書）との対応関係

- **プロジェクト全体方針**: `Default Vault/キャリア活動/目標管理サイト/計画書.md`
- **計画マップUI仕様**: `Default Vault/キャリア活動/目標管理サイト/mini_要件書/mini_要件書_計画マップUI.md`
- **各画面・共通導線**: `Default Vault/キャリア活動/目標管理サイト/mini_要件書/mini_要件書_各画面UI.md`
- **AI連携ツール仕様**: `Default Vault/キャリア活動/目標管理サイト/mini_要件書/mini_要件書_AI編集ツール.md`
- **TODO / 次の意思決定**: `Default Vault/キャリア活動/目標管理サイト/longstep.py`
