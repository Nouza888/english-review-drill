# 瞬発英語ドリル

日本語の問題を見て英語を瞬時に組み立てる、noz個人用の静的PWAです。バックエンド、認証、アクセス解析はなく、公開用データはビルド済みのJSONだけです。

公開サイト: <https://nouza888.github.io/english-review-drill/>

## 使い方

- 学習分野は`TAM業務`と`TOEIC S&W・日常英語`を区別します。TAMは重要文章80文（既存40選＋追加40選）、TOEIC・日常英語は72問です。TAMの旧86問は公開教材から置き換え、新教材に旧問題の解答履歴や習得状態を引き継ぎません。
- `ドリル`では日本語だけを見て英文を考え、`模範解答を見る`、`次の問題`の順に進みます。一巡するまで同じ問題は出ません。初期範囲は全問題で、TAMは掲載順、TOEIC・日常英語はランダムです。出題順は切り替えられます。
- TAMの`出典`で`既存40選（01〜40）`または`追加40選（41〜80）`だけに絞れます。掲載順ではObsidianの番号順に出題し、一巡後も同じ順序で練習できます。
- `今回の要復習`をチェックすると、そのタブでの一時マークが付きます。出題範囲や問題一覧の`今回のチェック`で、チェックした問題だけに絞れます。正本由来の`⭐ 要復習`とは別の目印です。
- `自分の英作文`は答えを見る前の任意のメモ欄です。入力文は問題ごとに保持され、模範解答を表示しても残ります。自動採点は行いません。
- 一時マークと入力文は同じタブでの画面・教材切替では保持し、再読み込みで消えます。端末間では共有せず、ブラウザのストレージやサーバーへ保存せず、Obsidianへ逆同期もしません。PWAで新しい版へ更新した場合も再読み込みにより消えます。
- `問題一覧`では全問題を検索し、状態・テーマ・難易度・出典で絞り込めます。正本の復習状態はサイト上では編集しません。
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

ObsidianのMarkdownが正本です。`public/data/cards.json`（TAM）と`public/data/library.json`（TOEIC・日常英語と共通用語集）は直接編集せず、同期スクリプトから生成します。

1. `.env.example`を`.env`へコピーする。
2. TAMの4つの入力パスを設定する。`DRILL_TAM_CORE_PATH`は`10_TAM業務の重要文章40選.md`、`DRILL_TAM_CORE_NOTES_PATH`は`11_TAM業務の重要文章40選・解説.md`。`DRILL_TAM_EXTENSION_PATH`は`12_TAM・IT・クラウド・AI英語_追加重要文章40選.md`、`DRILL_TAM_EXTENSION_NOTES_PATH`は`13_TAM・IT・クラウド・AI英語_追加重要文章40選・解説.md`。
3. `DRILL_TOEIC_MASTER_PATH`へ`English/TOEIC S&W/TOEIC S&W・日常英語 ドリルマスター.md`、`DRILL_GLOSSARY_PATH`へ`English/共通英語用語集.md`のパスを設定する。
4. `npm run sync:data`を実行する。TAMの同期後、追加ライブラリを生成する。内容が変わらなければJSONや生成時刻は書き換えない。
5. 生成差分に顧客名や内部情報がないことを目視確認し、`npm run check`を実行する。

TOEIC・日常英語と共通用語集だけを更新する場合は、`npm run sync:library`を使います。既存のTAM JSONを保持し、その問題IDとの関連を検証します。

TAMは`### 01｜見出し`形式を読み、暗記用と解説付きの番号・日本語・英文・型の一致を検証します。既存40選を01〜40、追加40選を41〜80として連結します。公開するのは日本語・代表英文・型・解説・別解だけです。出典URL、個人向けの追加理由、旧ED番号の対応表は公開しません。

新しい安定IDは`TE-0001`〜`TE-0080`。原本09/08や旧ED番号は書き換えません。新教材はすべて`assistant-model`、復習状態未分類、試行回数0とし、難易度も推定で付けません。旧86問と同じ番号を再利用して関連問題が誤って結びつくことを防ぎます。

TOEIC・日常英語のマスター表の列は次のとおりです。配列項目の区切りには`<br>`を使います。`/`は英語表現の一部として保持され、区切りにはなりません。

```text
ID | Added | Source | Difficulty | Theme | Japanese prompt | Final English | Reusable phrases | Points | Answer provenance
```

`TD-0001`のような安定IDを用い、TAMのIDと重複させません。TOEIC用の復習台帳は設けず、初期状態は未分類・解答履歴なしです。

共通用語集は次の7列をこの順番で使います。`Tags`と`Card IDs`の複数値は`<br>`で区切ります。`Card IDs`はTAMまたはTOEICの実在する問題IDを1つ以上指定します。同じ表現を分野ごとに重複登録せず、関連IDやタグを追加します。

```text
ID | Expression | Meaning | Example | Point | Tags | Card IDs
```

用語集では安定ID・必須項目・表現の重複・参照先を検証します。問題文の重複はそれぞれの分野内で検査し、別分野で同じ英文を扱うことは許容します。共通用語集も公開JSONに含まれるため、機密情報を入れないでください。

用語集原本が旧ED番号を参照している13語は、公開時に`scripts/lib/essentials.mjs`の対応表で新教材に結び直します。本文やTOEICへのリンクは保持します。新たな旧ED参照が加わり対応表にない場合は、誤った問題へ結ばず同期を停止します。

現在のTAM同期は40＋40件と01からの連番を検証します。`.env`の任意の期待件数を使う場合は、全体80・要復習0・定着0・未分類80です。旧86問用の期待件数設定は削除してください。

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
