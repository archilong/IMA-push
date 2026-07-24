# IMA cpolar tunnel

Double-click `..\一键启动IMA传输和Cpolar.bat` from the IMA directory, or `start-ima-cpolar.bat` in this folder, to start the local IMA service and expose it through cpolar.

The script maps local port `39387` and prints the public webhook address:

```text
PUBLIC_WEBHOOK_URL=https://...cpolar.../webhook
```

No webhook token is appended.
