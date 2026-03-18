package com.micstream.phone;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Enumeration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class NativeBridge {
    private Context context;
    private SharedPreferences prefs;
    private WebView webView;
    private ExecutorService executor = Executors.newFixedThreadPool(30);

    public NativeBridge(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
        this.prefs = context.getSharedPreferences("MicStream", Context.MODE_PRIVATE);
    }

    // JS вызывает это — Java сканирует в фоне и зовёт JS callback когда нашёл
    @JavascriptInterface
    public void findServerAsync() {
        executor.submit(() -> {
            // Сначала сохранённый IP
            String saved = prefs.getString("server_ip", "");
            if (!saved.isEmpty()) {
                String[] parts = saved.split(":");
                String ip = parts[0];
                if (tryHttp(ip, 3001)) {
                    callbackFound(ip, 3000);
                    return;
                }
            }

            // Получаем свою подсеть
            String myIP = getLocalIP();
            if (myIP == null) {
                callbackNotFound();
                return;
            }
            String subnet = myIP.substring(0, myIP.lastIndexOf('.'));

            AtomicBoolean found = new AtomicBoolean(false);
            ExecutorService scanPool = Executors.newFixedThreadPool(30);

            for (int i = 1; i <= 254; i++) {
                if (found.get()) break;
                final String ip = subnet + "." + i;
                scanPool.submit(() -> {
                    if (!found.get() && tryHttp(ip, 3001)) {
                        if (found.compareAndSet(false, true)) {
                            callbackFound(ip, 3000);
                        }
                    }
                });
            }

            scanPool.shutdown();
            try { scanPool.awaitTermination(10, java.util.concurrent.TimeUnit.SECONDS); } catch (Exception e) {}

            if (!found.get()) callbackNotFound();
        });
    }

    private void callbackFound(String ip, int port) {
        String host = ip + ":" + port;
        prefs.edit().putString("server_ip", host).apply();
        String js = "javascript:onNativeFound('" + ip + "'," + port + ")";
        ((android.app.Activity) context).runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private void callbackNotFound() {
        ((android.app.Activity) context).runOnUiThread(() ->
            webView.evaluateJavascript("javascript:onNativeNotFound()", null));
    }

    private boolean tryHttp(String ip, int port) {
        try {
            URL url = new URL("http://" + ip + ":" + port + "/discover");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(500);
            conn.setReadTimeout(500);
            conn.setRequestMethod("GET");
            int code = conn.getResponseCode();
            if (code == 200) {
                BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder resp = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) resp.append(line);
                br.close();
                conn.disconnect();
                return resp.toString().contains("micstream-server");
            }
            conn.disconnect();
        } catch (Exception e) {}
        return false;
    }

    private String getLocalIP() {
        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            while (ifaces.hasMoreElements()) {
                NetworkInterface iface = ifaces.nextElement();
                if (!iface.isUp() || iface.isLoopback()) continue;
                Enumeration<InetAddress> addrs = iface.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (addr.isLoopbackAddress()) continue;
                    String ip = addr.getHostAddress();
                    if (ip != null && (ip.startsWith("192.168.") || ip.startsWith("10.")))
                        return ip;
                }
            }
        } catch (Exception e) {}
        return null;
    }

    @JavascriptInterface
    public void saveIP(String ip) {
        prefs.edit().putString("server_ip", ip).apply();
    }

    @JavascriptInterface
    public String getSavedIP() {
        return prefs.getString("server_ip", "");
    }

    @JavascriptInterface
    public void showToast(String msg) {
        ((android.app.Activity) context).runOnUiThread(() ->
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show());
    }
}