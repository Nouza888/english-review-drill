# 瞬発英語ドリル

日本語の問題を見て英語を瞬時に組み立てる、noz個人用の静的PWAです。バックエンド、認証、アクセス解析はなく、公開用データはビルド済みのJSONだけです。

公開サイト: <https://nouza888.github.io/english-review-drill/>

## 使い方

- 学習分野は`TAM業務用`と`TOEIC S&W・日常英語`を区別します。TAMの既存問題・復習状態は維持し、新しく収録した型には解答履歴や習得状態を推定で付けません。
- `ドリル`では日本語だけを見て英文を考え、`模範解答を見る`、`次の問題`の順に進みます。一巡するまで同じ問題は出ません。TAMは⭐要復習、新しいTOEIC・日常英語は全問題から開始します。
- `問題一覧`では全問題を検索し、状態・テーマ・難易度・出典で絞り込めます。復習状態は正本で管理するため、サイト上では編集しません。
- `共通用語集`は両分野で共有します。慣用句に限らず、`make a phone call`のような定番の語の組み合わせも、意味・例文・ポイント・関連問題と一緒に参照します。
- TOEIC・日常英語の一文ドリルは、学んだ型を組み立てる補助練習です。正式な試験の全設問を再現するものではなく、表示英文だけが唯一の正解という意味でもありません。
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

ObsidianのMarkdownが正本です。`public/data/cards.json`（TAM）と`public/data/library.json`（TOEIC・日常英語と共通用語集）は直接編集せず、同期スクリプトから生成します。既存のTAMデータを別schemaへ移し替える必要はありません。

1. `.env.example`を`.env`へコピーする。
2. `DRILL_MASTER_PATH`へ`09_瞬発ドリル全問題マスター.md`、`DRILL_REVIEW_PATH`へ`08_要復習問題リスト.md`のパスを設定する。
3. `DRILL_TOEIC_MASTER_PATH`へ`English/TOEIC S&W/TOEIC S&W・日常英語 ドリルマスター.md`、`DRILL_GLOSSARY_PATH`へ`English/共通英語用語集.md`のパスを設定する。
4. `npm run sync:data`を実行する。TAMの同期後、追加ライブラリを生成する。内容が変わらなければJSONや生成時刻は書き換えない。
5. 生成差分に顧客名や内部情報がないことを目視確認し、`npm run check`を実行する。

TOEIC・日常英語と共通用語集だけを更新する場合は、`npm run sync:library`を使います。既存のTAM JSONを保持し、その問題IDとの関連を検証します。

マスター表の列は次のとおりです。配列項目の区切りには`<br>`を使います。`/`は英語表現の一部として保持され、区切りにはなりません。

```text
ID | Added | Source | Difficulty | Theme | Japanese prompt | Final English | Reusable phrases | Points | Answer provenance
```

復習表の列は次のとおりです。両方の表は安定IDで結合され、復習表のIDがマスター表に存在しない場合や、同じIDの本文が食い違う場合は同期を中止します。

```text
ID | Status | Added | Theme | Japanese prompt | Final English | Reusable phrase | Last review | Attempts
```

TOEIC・日常英語のマスターも上記と同じ10列を使います。`TD-0001`のような安定IDを用い、TAMのIDと重複させません。TOEIC用の復習台帳は設けず、初期状態は未分類・解答履歴なしです。

共通用語集は次の7列をこの順番で使います。`Tags`と`Card IDs`の複数値は`<br>`で区切ります。`Card IDs`はTAMまたはTOEICの実在する問題IDを1つ以上指定します。同じ表現を分野ごとに重複登録せず、関連IDやタグを追加します。

```text
ID | Expression | Meaning | Example | Point | Tags | Card IDs
```

用語集では安定ID・必須項目・表現の重複・参照先を検証します。問題文の重複はそれぞれの分野内で検査し、別分野で同じ英文を扱うことは許容します。共通用語集も公開JSONに含まれるため、機密情報を入れないでください。

初期86問の受入確認だけは、`.env`の任意項目へ`86 / 17 / 1 / 68 / 18`を設定して実行します。これはTAMだけの件数です。通常の追加更新では空欄に戻し、件数を固定せず、ID・schema・重複・参照整合性から現在件数を検証します。

同期はメールアドレス、URL、Oracle SR番号、OCID、IPアドレス、ローカルパス、thread IDらしい値を検出すると停止します。検出内容そのものはエラーへ出しません。顧客名と社内固有名詞は機械判定できないため、公開前の目視確認が必須です。`.env`とObsidian原本はGit管理対象外です。

## GitHub Pages

`main`へのpushで`.github/workflows/deploy-pages.yml`が次を実行し、すべて成功した場合だけ`dist`をPagesへ公開します。

- 型検査
- Unit test
- `public/data/cards.json`と`public/data/library.json`のschema・重複・機密パターン・共通用語集の参照先検査
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

TOEIC・日常英語の追加は同分野のマスターへ、分野をまたぐ単語・慣用表現は共通用語集へ反映します。既存IDを変更せず、関連問題が増えたら同じ用語集行の`Card IDs`を更新します。公開URLへの反映は依頼・承認された範囲で実施します。
