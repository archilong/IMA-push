# IMA Push

Standalone service for receiving Officebook webhook payloads and pushing meeting Markdown into IMA.

## Start

```powershell
npm start
```

The service listens on port `39387` by default.

For local tunnel startup, double-click:

```text
一键启动IMA传输和Cpolar.bat
```

## Webhook

Use the public cpolar address printed by the startup script, ending with:

```text
/webhook
```

Connectivity checks return:

```json
{"code":0,"message":"success"}
```

## Configuration

Open the local UI:

```text
http://127.0.0.1:39387/
```

Enter the IMA Client ID and API Key in the UI. Local runtime configuration is stored under `data/` and is intentionally ignored by Git.

## Test

```powershell
npm test
```
