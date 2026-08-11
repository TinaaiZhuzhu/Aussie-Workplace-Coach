# Start the voice site

1. Open this folder in VS Code.
2. In VS Code, open **Terminal → New Terminal**.
3. Run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\Start-Aussie-English.ps1
   ```

4. At `Paste your OpenAI API key (input is hidden)`, paste the key and press Enter. Nothing will appear while you paste; this is intentional.
5. Open <http://localhost:3000>.
6. Keep the terminal open. Use `Ctrl+C` to stop the site.

The key exists only in the server process environment for that run. The launcher removes it when the server stops. It is not written into the project or browser storage.
