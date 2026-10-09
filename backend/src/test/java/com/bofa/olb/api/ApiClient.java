package com.bofa.olb.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Minimal cookie-aware HTTP client: behaves like a browser/SPA (SESSION + XSRF-TOKEN cookies, X-XSRF-TOKEN header). */
public class ApiClient {

    public record Response(int status, HttpHeaders headers, JsonNode body) {
        public String str(String field) { return body.path(field).asText(null); }
        public long num(String field) { return body.path(field).asLong(); }
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final RestClient rc;
    final Map<String, String> cookies = new LinkedHashMap<>();

    public ApiClient(int port) {
        this.rc = RestClient.builder().baseUrl("http://localhost:" + port)
                .requestFactory(new JdkClientHttpRequestFactory()).build();
    }

    public Response get(String path) { return exchange(HttpMethod.GET, path, null); }
    public Response post(String path, Object body) { return exchange(HttpMethod.POST, path, body); }
    public Response delete(String path) { return exchange(HttpMethod.DELETE, path, null); }

    public Response login(String userId, String password) {
        return post("/api/login", Map.of("userId", userId, "password", password));
    }

    public Response loginDemo() {
        Response r = login("demo.user", "Password1");
        if (r.status() != 200) throw new IllegalStateException("login failed: " + r.body());
        return r;
    }

    public String cookie(String name) { return cookies.get(name); }
    public void setCookie(String name, String value) { cookies.put(name, value); }
    public void clearCookies() { cookies.clear(); }

    private Response exchange(HttpMethod method, String path, Object body) {
        RestClient.RequestBodySpec spec = rc.method(method).uri(path).accept(MediaType.APPLICATION_JSON);
        if (!cookies.isEmpty()) {
            spec.header(HttpHeaders.COOKIE, String.join("; ",
                    cookies.entrySet().stream().map(e -> e.getKey() + "=" + e.getValue()).toList()));
        }
        if (cookies.containsKey("XSRF-TOKEN")) spec.header("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
        if (body != null) spec.contentType(MediaType.APPLICATION_JSON).body(body);
        return spec.exchange((req, res) -> {
            List<String> setCookies = res.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE);
            for (String sc : setCookies) {
                String[] parts = sc.split(";");
                String[] nv = parts[0].split("=", 2);
                boolean delete = sc.toLowerCase().contains("max-age=0");
                if (delete || nv.length < 2 || nv[1].isEmpty()) cookies.remove(nv[0].trim());
                else cookies.put(nv[0].trim(), nv[1]);
            }
            byte[] bytes = res.getBody().readAllBytes();
            MediaType ct = res.getHeaders().getContentType();
            boolean json = ct != null && (ct.getSubtype().equals("json") || ct.getSubtype().endsWith("+json"));
            JsonNode node = bytes.length == 0 || !json ? MissingNode.getInstance() : MAPPER.readTree(bytes);
            return new Response(res.getStatusCode().value(), res.getHeaders(), node);
        }, false);
    }
}
