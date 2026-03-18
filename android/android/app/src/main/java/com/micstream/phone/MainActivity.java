package com.micstream.phone;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Build;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;

public class MainActivity extends BridgeActivity {

    private static final int MIC_PERMISSION_CODE = 101;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fullscreen + notch
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().getInsetsController().hide(
                    android.view.WindowInsets.Type.statusBars() |
                            android.view.WindowInsets.Type.navigationBars()
            );
            getWindow().getInsetsController().setSystemBarsBehavior(
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    android.view.View.SYSTEM_UI_FLAG_FULLSCREEN |
                            android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                            android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                            android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                            android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                            android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }

        requestMicPermission();
    }

    // Вызывается Capacitor после инициализации Bridge
    @Override
    public void onStart() {
        super.onStart();

        WebView webView = getBridge().getWebView();

        // Получаем текущий WebViewClient Capacitor и оборачиваем его
        WebViewClient capacitorClient = getBridge().getLocalServer() != null
                ? webView.getWebViewClient() : null;

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Принимаем самоподписанный сертификат для локальной сети
                handler.proceed();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                if (capacitorClient != null)
                    return capacitorClient.shouldOverrideUrlLoading(view, request);
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (capacitorClient != null)
                    capacitorClient.onPageFinished(view, url);
                super.onPageFinished(view, url);
            }
        });

        // Добавляем NativeBridge
        webView.addJavascriptInterface(new NativeBridge(this, webView), "Android");
    }

    private void requestMicPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) return;

        if (ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECORD_AUDIO)) {
            new AlertDialog.Builder(this)
                    .setTitle("Нужен доступ к микрофону")
                    .setMessage("MicStream транслирует звук с микрофона на ПК по Wi-Fi.")
                    .setPositiveButton("Разрешить", (d, w) ->
                            ActivityCompat.requestPermissions(this,
                                    new String[]{ Manifest.permission.RECORD_AUDIO }, MIC_PERMISSION_CODE))
                    .setNegativeButton("Отмена", null)
                    .show();
        } else {
            ActivityCompat.requestPermissions(this,
                    new String[]{ Manifest.permission.RECORD_AUDIO }, MIC_PERMISSION_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MIC_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] != PackageManager.PERMISSION_GRANTED) {
                new AlertDialog.Builder(this)
                        .setTitle("Разрешение отклонено")
                        .setMessage("Без микрофона приложение не работает.\nОткрыть настройки?")
                        .setPositiveButton("Настройки", (d, w) -> {
                            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                            i.setData(Uri.fromParts("package", getPackageName(), null));
                            startActivity(i);
                        })
                        .setNegativeButton("Отмена", null)
                        .show();
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
    }
}