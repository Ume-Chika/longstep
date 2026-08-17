# Longstep

長期目標を、現在地・中間目標・次の行動に分解して可視化する目標管理サイトです。

公開URL：<https://ume-chika.github.io/longstep/>

## 開発方針

- GitHub Pagesで公開できる静的サイトとして開発する
- 目標の立案・更新はユーザーが普段使うAIエージェントに任せる
- 計画の正本は、書類フォルダ内の`Longstep`（`~/Documents/Longstep`）に置くローカルJSONとする
- サイトは計画の作成・可視化・手動編集と、AI用Pythonツールの配置を担当する
- AIエージェントは各プロジェクトの`longstep.py`から共通ツールを呼び、必要な部分だけを取得・更新する
- 計画データはサーバーやAI APIへ送信しない。IndexedDBにはフォルダの利用許可と表示設定だけを保存する

## AI連携の使い方

1. サイトで書類フォルダ内の`Longstep`フォルダと、AIに使わせたいプロジェクトフォルダを選ぶ
2. 保存先に`longstep.pyz`、プロジェクト側に`longstep.py`が置かれる
3. AIエージェントに`longstep.py`の関数（`get_plan_summary` / `list_goals` / `get_goal` / `update_plan` / `add_goal` / `update_goal` / `delete_goal`）を呼ばせる
4. 更新はサイトを開いている間、1秒ごとに計画マップへ反映される

Pythonは3.12以降が必要です。追加パッケージは使いません。

## ステータス

MVPが完成し、GitHub Pagesで公開中です。
ローカルJSONとPythonツール（`longstep.py`）を用いたAIエージェント連携に対応しています。

## 今後の予定

1. 実際の目標で使い、操作感や課題を検証する
2. 検証結果をもとに要件を見直し、改善・追加機能を検討する
