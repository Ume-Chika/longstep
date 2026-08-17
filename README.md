# Longstep

> AIエージェントと一緒に進める、ローカル完結の長期目標管理マップ

[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue?style=flat-square)](https://ume-chika.github.io/longstep/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen?style=flat-square)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/python-%3E%3D3.12-blue?style=flat-square)](https://www.python.org/)

**Longstep** は、長期目標を現在地・中間目標・次の行動に分解し、RPG調のマップで可視化する目標管理ツールです。  
普段お使いのAIエージェント（Claude、ChatGPT、Cursor、Cline等）と連携し、AIが計画を直接読み書きしながら1秒以内にマップへ自動反映されます。

🌐 **公開URL**: [https://ume-chika.github.io/longstep/](https://ume-chika.github.io/longstep/)

---

## ✨ 主な特徴

- 🗺️ **RPG調のロードマップ可視化**
  - 目標の「分岐」と「合流」を自由に繋ぎ、大目標・中目標・小目標の階層で計画を俯瞰。
  - 前提が完了した「今すぐ着手できる目標（最大3件）」を自動で明るくハイライト。
- 🤖 **AIエージェントとのリアルタイム1秒同期**
  - プロジェクトフォルダに置いた軽量ツール（`longstep.py`）を通じて、AIが計画を直接取得・更新。
  - ブラウザの再読み込み不要で、1秒以内に計画マップが自動更新されます。
- 🔒 **安心の完全ローカル完結設計**
  - 計画データ（正本JSON）はお使いの端末の書類フォルダ（`~/Documents/Longstep/`）にのみ保存。
  - 計画内容が外部サーバーへ送信されることは一切ありません。

---

## 🚀 クイックスタート

### 1. ブラウザで計画を作成
1. [Longstep](https://ume-chika.github.io/longstep/) を開く。
2. 保存先フォルダ（`~/Documents/Longstep`）を選択し、達成したい長期目標を作成。
3. カードの「＋」や道筋（「✎」ドラッグ）で目標を配置。

### 2. AI連携ツール（longstep.py）を配置
- ホーム画面で計画の「…」メニューから **「AI連携ファイルを追加」** を選び、作業したいプロジェクトフォルダを選択します。
- これにより、プロジェクトフォルダ内に `longstep.py`（約4KB）が配置されます。

### 3. AIエージェントに指示する
プロジェクトフォルダ内で動くAIエージェント（Cursor、Cline、Claude等）に指示を出します。

---

## 💬 AIへの指示プロンプト例

AIエージェントには、目的に応じて以下のように伝えるだけで共同作業が進みます。

- **次の目標を進めたいとき**
  > 「`longstep.py` で計画書を確認し、次の小目標に着手してください」
- **新しい目標を立てたいとき**
  > 「`longstep.py` で次にするべき小目標を立ててください」
- **作業が一段落したとき**
  > 「`longstep.py` で各目標の達成度を判定し、計画書を更新してください」
- **計画を整理・見直したいとき**
  > 「`longstep.py` で現在の計画を確認し、目標の並びや内容を整理してください」

---

## ❓ よくある質問（FAQ）

<details>
<summary><strong>Q. 道筋はどう繋ぐのが正しい？</strong></summary>

どちらかでも進められる作業は**「分岐」**させ、両方が終わってからでないとできない目標へは**「合流」**させます。カード右端の「✎」をドラッグすることで自由に道筋を繋げられます。
</details>

<details>
<summary><strong>Q. 黄色い枠やカードの記号の意味は？</strong></summary>

黄色い枠は**「前提が完了し今すぐ着手できる目標」**もしくは**「分割するべき目標」**です。カード左の「＋」で前提追加、上部の「⋮⋮」で上下入れ替え、「◆ / ✦ / ·」は大中小の目標レベルを表します。
</details>

<details>
<summary><strong>Q. 複数のプロジェクトを管理できる？</strong></summary>

できます。別のプロジェクトは画面右下の追加ボタンの「新規計画書を作成する」から作成してください。表示する計画書の切り替えはホームから可能です。
</details>

<details>
<summary><strong>Q. AIは目標の追加や道筋の接続もできる？</strong></summary>

できます。進捗の更新だけでなく、「この目標を達成するための小目標を作って繋げて」と指示すれば、目標の細分化や道筋の接続までAIが自動で構築します。
</details>

<details>
<summary><strong>Q. 別の作業フォルダでも同じ計画を操作できる？</strong></summary>

できます。**ホーム画面で計画を右クリック→「AI連携ファイルを追加」→作業したい各プロジェクトフォルダを選択** で、AI連携ファイルを追加できます。複数のフォルダからAIエージェントがあなたの計画書を編集できるようになります。
</details>

<details>
<summary><strong>Q. 複数のPC間で同じ計画を同期するには？</strong></summary>

できません。
</details>

---

## 🛠️ 開発・ビルド手順（開発者向け）

### 必要環境
- **Node.js**: 24 LTS 以上
- **Python**: 3.12 以上（標準ライブラリのみ使用）

### セットアップ
```bash
# リポジトリのクローン
git clone https://github.com/Ume-Chika/longstep.git
cd longstep

# 依存パッケージのインストール
npm install
```

### 開発サーバー起動
```bash
npm run dev
```

### テスト・検証
```bash
# TypeScript単体テスト（Node test runner）
npm test

# Python単体テスト
npm run test:py

# Linter（oxlint）
npm run lint
```

### ビルド
```bash
# Python zipapp（longstep.pyz）の生成
npm run build:pyz

# 本番Webアセットのビルド
npm run build
```
