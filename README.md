# 瞬発英語ドリル

日本語の問題を見て英語を瞬時に組み立てる、noz個人用の静的PWAです。バックエンド、認証、アクセス解析はなく、公開用データはビルド済みのJSONだけです。

## 使い方

- `ドリル`は⭐要復習から開始します。日本語だけを見て英文を考え、`模範解答を見る`、`次の問題`の順に進みます。一巡するまで同じ問題は出ません。
- `問題一覧`では全問題を検索し、状態・テーマ・難易度・出典で絞り込めます。復習状態は正本で管理するため、サイト上では編集しません。
- iPhoneではSafariの共有メニューから`ホーム画面に追加`、Macでは対応ブラウザのインストール操作でPWAとして使えます。一度オンラインで開いた後は保存済みの問題をオフラインでも利用できます。

## ローカル実行

Node.js 22とnpmを使用します。

```sh
npm install
npm run dev
```

品質チェックは次の1コマンドです。

```sh
npm run check
```

`check`は型検査、Unit test、公開データ検証、production buildを順番に実行します。

## Obsidianから公開データを同期する

ObsidianのMarkdownが正本です。`public/data/cards.json`は直接編集せず、同期スクリプトから生成します。

1. `.env.example`を`.env`へコピーする。
2. `DRILL_MASTER_PATH`へ`09_瞬発ドリル全問題マスター.md`、`DRILL_REVIEW_PATH`へ`08_要復習問題リスト.md`のパスを設定する。
3. `npm run sync:data`を実行する。
4. 生成差分に顧客名や内部情報がないことを目視確認し、`npm run check`を実行する。

マスター表の列は次のとおりです。配列項目の区切りには`<br>`を使います。`/`は英語表現の一部として保持され、区切りにはなりません。

```text
ID | Added | Source | Difficulty | Theme | Japanese prompt | Final English | Reusable phrases | Points | Answer provenance
```

復習表の列は次のとおりです。両方の表は安定IDで結合され、復習表のIDがマスター表に存在しない場合や、同じIDの本文が食い違う場合は同期を中止します。

```text
ID | Status | Added | Theme | Japanese prompt | Final English | Reusable phrase | Last review | Attempts
```

初期86問の受入確認だけは、`.env`の任意項目へ`86 / 17 / 1 / 68 / 18`を設定して実行します。通常の追加更新では空欄に戻し、件数を固定せず、ID・schema・重複・参照整合性から現在件数を検証します。

同期はメールアドレス、URL、Oracle SR番号、OCID、IPアドレス、ローカルパス、thread IDらしい値を検出すると停止します。検出内容そのものはエラーへ出しません。顧客名と社内固有名詞は機械判定できないため、公開前の目視確認が必須です。`.env`とObsidian原本はGit管理対象外です。

## GitHub Pages

`main`へのpushで`.github/workflows/deploy-pages.yml`が次を実行し、すべて成功した場合だけ`dist`をPagesへ公開します。

- 型検査
- Unit test
- `public/data/cards.json`のschema・重複・機密パターン検査
- production build
- GitHub Pages artifactのデプロイ

初回だけrepositoryの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定します。repositoryは公開されるため、commit前に公開JSONの差分を必ず確認してください。

個人GitHubのnoreplyアドレスをrepository-localに設定してからcommitします。

```sh
git config user.name "YOUR_GITHUB_USERNAME"
git config user.email "YOUR_GITHUB_ID+YOUR_GITHUB_USERNAME@users.noreply.github.com"
```

## 更新契約

通常問題は学習チャットで`この問題をアプリに追加`または`今回の5問をアプリに追加`と明示した場合だけ追加します。`r` / `R`で要復習登録した問題はマスターにも同じIDで収録します。更新時は、Obsidian upsert、重複・機密検査、同期、テスト、commit、push、Pagesの読み戻しまでを一連で確認します。
