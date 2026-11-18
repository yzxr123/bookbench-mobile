package io.github.yzxr123.fangmo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.Collections;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final Uri ORIGIN = Uri.parse("https://appassets.androidplatform.net");
    private static final int OPEN_FILE = 1;
    private static final int SAVE_FILE = 2;
    private WebView web;
    private ValueCallback<Uri[]> fileChooser;
    private WebMessagePort exportPort;
    private File stagedFile;
    private OutputStream stagedOutput;
    private Intent saveIntent;
    private boolean exiting;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        applyOrientation(getPreferences(MODE_PRIVATE).getString("orientation", "system"));
        WebView.setWebContentsDebuggingEnabled(
            (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web = new WebView(this);
        web.setBackgroundColor(0xff21252b);
        setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setSupportZoom(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!isLocal(uri)) return null;
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                if (path.contains("..") || path.contains("\\")) return missing();
                String extension = path.substring(path.lastIndexOf('.') + 1);
                String type;
                switch (extension) {
                    case "js": type = "text/javascript"; break;
                    case "webmanifest": type = "application/manifest+json"; break;
                    case "bbtheme": type = "text/plain"; break;
                    default: type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
                }
                try {
                    return new WebResourceResponse(type == null ? "application/octet-stream" : type,
                        null, getAssets().open("web" + path));
                } catch (IOException error) {
                    return missing();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri)) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException error) {
                        Toast.makeText(MainActivity.this, "没有可用的浏览器", Toast.LENGTH_SHORT).show();
                    }
                }
                return request.isForMainFrame();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!isLocal(Uri.parse(url))) return;
                if (exportPort != null) exportPort.close();
                WebMessagePort[] channel = view.createWebMessageChannel();
                exportPort = channel[0];
                exportPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                    @Override
                    public void onMessage(WebMessagePort port, WebMessage message) {
                        receiveExport(port, message.getData());
                    }
                });
                String orientation = getPreferences(MODE_PRIVATE).getString("orientation", "system");
                view.postWebMessage(new WebMessage("blockbench-android:" + orientation,
                    new WebMessagePort[] { channel[1] }), ORIGIN);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooser != null) fileChooser.onReceiveValue(null);
                fileChooser = callback;
                try {
                    startActivityForResult(params.createIntent(), OPEN_FILE);
                } catch (ActivityNotFoundException error) {
                    fileChooser.onReceiveValue(null);
                    fileChooser = null;
                }
                return true;
            }
        });
        web.loadUrl(ORIGIN + "/index.html");
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && ORIGIN.getAuthority().equals(uri.getAuthority());
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(),
            new ByteArrayInputStream(new byte[0]));
    }

    private void receiveExport(WebMessagePort port, String data) {
        if (data == null) return;
        if (data.startsWith("orientation:")) {
            applyOrientation(data.substring("orientation:".length()));
            return;
        }
        if ("exit".equals(data)) {
            if (exiting) finish();
            return;
        }
        try {
            if ("abort".equals(data)) {
                if (stagedOutput != null) discardStagedFile();
                return;
            }
            if ("finish".equals(data)) {
                if (stagedOutput == null) throw new IOException("No export in progress");
                stagedOutput.close();
                stagedOutput = null;
                startActivityForResult(saveIntent, SAVE_FILE);
                return;
            } else if (data.startsWith("data:")) {
                if (stagedOutput == null || data.length() > 44000) throw new IOException("Invalid export chunk");
                stagedOutput.write(Base64.decode(data.substring(5), Base64.DEFAULT));
            } else {
                if (stagedFile != null) {
                    port.postMessage(new WebMessage("busy"));
                    return;
                }
                JSONObject info = new JSONObject(data);
                String name = info.getString("name").replace('/', '_').replace('\\', '_');
                String type = info.getString("type").split(";", 2)[0];
                if (!type.contains("/") || type.equals("octet/stream")) type = "application/octet-stream";
                stagedFile = File.createTempFile("export-", ".tmp", getCacheDir());
                stagedOutput = new FileOutputStream(stagedFile);
                saveIntent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(type)
                    .putExtra(Intent.EXTRA_TITLE, name);
            }
            port.postMessage(new WebMessage("ok"));
        } catch (Exception error) {
            discardStagedFile();
            port.postMessage(new WebMessage("error"));
        }
    }

    private void applyOrientation(String value) {
        int requested;
        switch (value) {
            case "portrait": requested = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT; break;
            case "landscape": requested = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE; break;
            case "system": requested = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED; break;
            default: return;
        }
        getPreferences(MODE_PRIVATE).edit().putString("orientation", value).apply();
        if (getRequestedOrientation() != requested) setRequestedOrientation(requested);
    }

    private void replyToSave(WebMessagePort port, String result) {
        if (port == exportPort && port != null && !isDestroyed()) {
            port.postMessage(new WebMessage(result));
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OPEN_FILE && fileChooser != null) {
            ValueCallback<Uri[]> callback = fileChooser;
            fileChooser = null;
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
        } else if (request == SAVE_FILE && stagedFile != null) {
            WebMessagePort port = exportPort;
            File file = stagedFile;
            stagedFile = null;
            saveIntent = null;
            Uri target = result == RESULT_OK && data != null ? data.getData() : null;
            if (target == null) {
                file.delete();
                replyToSave(port, "cancel");
                return;
            }
            new Thread(() -> {
                try {
                    try (OutputStream destination = getContentResolver().openOutputStream(target, "wt")) {
                        if (destination == null) throw new IOException("Cannot open the selected document");
                        Files.copy(file.toPath(), destination);
                    }
                    runOnUiThread(() -> replyToSave(port, "ok"));
                } catch (IOException | SecurityException error) {
                    runOnUiThread(() -> replyToSave(port, "error"));
                } finally {
                    file.delete();
                }
            }, "Blockbench export").start();
        }
    }

    private void discardStagedFile() {
        if (stagedOutput != null) {
            try {
                stagedOutput.close();
            } catch (IOException ignored) {}
        }
        if (stagedFile != null) stagedFile.delete();
        stagedOutput = null;
        stagedFile = null;
        saveIntent = null;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else if (!exiting) {
            exiting = true;
            web.evaluateJavascript("Promise.resolve(window.AutoBackup?.backupOpenProject())"
                + ".catch(console.error).finally(() => window.AndroidPackage?.finishExit())", null);
            web.postDelayed(() -> { if (!isFinishing()) finish(); }, 2000);
        }
    }

    @Override
    protected void onPause() {
        web.evaluateJavascript("window.AutoBackup?.backupOpenProject().catch(console.error)", null);
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.evaluateJavascript("window.AutoBackup?.pruneExpired().catch(console.error)", null);
    }

    @Override
    protected void onDestroy() {
        if (exportPort != null) exportPort.close();
        discardStagedFile();
        if (fileChooser != null) fileChooser.onReceiveValue(null);
        web.destroy();
        super.onDestroy();
    }
}
