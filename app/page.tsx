"use client";

import { useSession, signIn, signOut } from "@/lib/auth-client";
import { useState } from "react";

type RequestHistory = {
  id: string;
  method: string;
  url: string;
  timestamp: Date;
  status?: number;
};

type Header = {
  id: string;
  key: string;
  value: string;
};

export default function Home() {
  const { data: session, isPending } = useSession();
  
  // API Request state
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<Header[]>([
    { id: "1", key: "Content-Type", value: "application/json" },
  ]);
  const [bodyType, setBodyType] = useState<"json" | "text" | "form-data">("json");
  const [body, setBody] = useState("{}");
  const [formData, setFormData] = useState<Header[]>([{ id: "1", key: "", value: "" }]);
  
  // Response state
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    time: number;
  } | null>(null);
  
  // History state
  const [history, setHistory] = useState<RequestHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Connection creation state
  const [connectionEmail, setConnectionEmail] = useState("");
  const [creatingConnection, setCreatingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);

  const handleGoogleSignIn = async () => {
    await signIn.social({
      provider: "google",
      callbackURL: "/",
    });
  };

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/";
        },
      },
    });
  };

  const addHeader = () => {
    setHeaders([...headers, { id: Date.now().toString(), key: "", value: "" }]);
  };

  const removeHeader = (id: string) => {
    setHeaders(headers.filter((h) => h.id !== id));
  };

  const updateHeader = (id: string, field: "key" | "value", value: string) => {
    setHeaders(headers.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  };

  const addFormDataField = () => {
    setFormData([...formData, { id: Date.now().toString(), key: "", value: "" }]);
  };

  const removeFormDataField = (id: string) => {
    setFormData(formData.filter((f) => f.id !== id));
  };

  const updateFormDataField = (id: string, field: "key" | "value", value: string) => {
    setFormData(formData.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  };

  const loadFromHistory = (historyItem: RequestHistory) => {
    setUrl(historyItem.url);
    setMethod(historyItem.method);
    setShowHistory(false);
  };

  const createConnection = async () => {
    if (!session?.user.id) {
      setConnectionResult({
        success: false,
        message: "You must be signed in to create a connection",
      });
      return;
    }

    if (!connectionEmail.trim()) {
      setConnectionResult({
        success: false,
        message: "Please enter an email address",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(connectionEmail.trim())) {
      setConnectionResult({
        success: false,
        message: "Please enter a valid email address",
      });
      return;
    }

    setCreatingConnection(true);
    setConnectionResult(null);

    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          user_id: session.user.id,
          email: connectionEmail.trim(),
          connection_type: "api",
          start_watching: true,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setConnectionResult({
          success: true,
          message: "Connection created successfully!",
          data,
        });
        setConnectionEmail("");
      } else {
        setConnectionResult({
          success: false,
          message: data.error || "Failed to create connection",
          data,
        });
      }
    } catch (error) {
      setConnectionResult({
        success: false,
        message: error instanceof Error ? error.message : "Network error occurred",
      });
    } finally {
      setCreatingConnection(false);
    }
  };

  const sendRequest = async () => {
    if (!url.trim()) {
      alert("Please enter a URL");
      return;
    }

    setLoading(true);
    setResponse(null);
    const startTime = Date.now();

    try {
      // Build headers object
      const headersObj: Record<string, string> = {};
      headers.forEach((h) => {
        if (h.key.trim()) {
          headersObj[h.key.trim()] = h.value.trim();
        }
      });

      // Build request options
      const options: RequestInit = {
        method,
        headers: headersObj,
        credentials: "include", // Include cookies for session
      };

      // Add body for methods that support it
      if (["POST", "PUT", "PATCH"].includes(method)) {
        if (bodyType === "json") {
          try {
            const parsed = JSON.parse(body);
            options.body = JSON.stringify(parsed);
            if (!headersObj["Content-Type"]) {
              options.headers = { ...headersObj, "Content-Type": "application/json" };
            }
          } catch (e) {
            alert("Invalid JSON in request body");
            setLoading(false);
            return;
          }
        } else if (bodyType === "text") {
          options.body = body;
          if (!headersObj["Content-Type"]) {
            options.headers = { ...headersObj, "Content-Type": "text/plain" };
          }
        } else if (bodyType === "form-data") {
          const formDataObj = new FormData();
          formData.forEach((f) => {
            if (f.key.trim()) {
              formDataObj.append(f.key.trim(), f.value.trim());
            }
          });
          options.body = formDataObj;
          // Remove Content-Type header to let browser set it with boundary
          const { "Content-Type": _, ...restHeaders } = headersObj;
          options.headers = restHeaders;
        }
      }

      // Make the request
      const response = await fetch(url, options);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Get response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Get response body
      const contentType = response.headers.get("content-type") || "";
      let responseBody: string;

      if (contentType.includes("application/json")) {
        try {
          const json = await response.json();
          responseBody = JSON.stringify(json, null, 2);
        } catch {
          responseBody = await response.text();
        }
      } else {
        responseBody = await response.text();
      }

      setResponse({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        time: responseTime,
      });

      // Add to history
      const historyItem: RequestHistory = {
        id: Date.now().toString(),
        method,
        url,
        timestamp: new Date(),
        status: response.status,
      };
      setHistory([historyItem, ...history.slice(0, 19)]); // Keep last 20
    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      setResponse({
        status: 0,
        statusText: "Error",
        headers: {},
        body: error instanceof Error ? error.message : "Network error",
        time: responseTime,
      });
    } finally {
      setLoading(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-lg text-zinc-600 dark:text-zinc-400">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      {session ? (
        <div className="mx-auto max-w-7xl px-4 py-8">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                    {session.user.name?.[0]?.toUpperCase() || session.user.email?.[0]?.toUpperCase() || "U"}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
                  API Tester
                </h1>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {session.user.email}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {session.user.id}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
              >
                History ({history.length})
              </button>
              <button
                onClick={handleSignOut}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Create Connection Card */}
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                Create Gmail Connection
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Connect a Gmail account to start watching for emails
              </p>
            </div>
            <div className="flex gap-3">
              <input
                type="email"
                value={connectionEmail}
                onChange={(e) => setConnectionEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !creatingConnection) {
                    createConnection();
                  }
                }}
                placeholder="your-email@gmail.com"
                disabled={creatingConnection}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400"
              />
              <button
                onClick={createConnection}
                disabled={creatingConnection || !connectionEmail.trim()}
                className="rounded-lg bg-black px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {creatingConnection ? "Creating..." : "Create Connection"}
              </button>
            </div>
            {connectionResult && (
              <div
                className={`mt-4 rounded-lg border p-4 ${
                  connectionResult.success
                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                    : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    connectionResult.success
                      ? "text-green-900 dark:text-green-100"
                      : "text-red-900 dark:text-red-100"
                  }`}
                >
                  {connectionResult.message}
                </p>
                {connectionResult.data && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-400">
                      View response details
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-xs dark:bg-zinc-800">
                      {JSON.stringify(connectionResult.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* History Sidebar */}
          {showHistory && (
            <div className="fixed right-0 top-0 z-50 h-full w-80 overflow-y-auto border-l border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50">History</h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  ✕
                </button>
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">No requests yet</p>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          item.method === "GET" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100" :
                          item.method === "POST" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" :
                          item.method === "PUT" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100" :
                          item.method === "DELETE" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100" :
                          "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
                        }`}>
                          {item.method}
                        </span>
                        {item.status && (
                          <span className={`text-xs ${
                            item.status >= 200 && item.status < 300 ? "text-green-600 dark:text-green-400" :
                            item.status >= 400 ? "text-red-600 dark:text-red-400" :
                            "text-zinc-600 dark:text-zinc-400"
                          }`}>
                            {item.status}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
                        {item.url}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                        {item.timestamp.toLocaleTimeString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Request Panel */}
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">Request</h2>
                
                {/* Method and URL */}
                <div className="mb-4 flex gap-2">
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  >
                    <option>GET</option>
                    <option>POST</option>
                    <option>PUT</option>
                    <option>PATCH</option>
                    <option>DELETE</option>
                    <option>HEAD</option>
                    <option>OPTIONS</option>
                  </select>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://api.example.com/endpoint"
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400"
                  />
                  <button
                    onClick={sendRequest}
                    disabled={loading || !url.trim()}
                    className="rounded-lg bg-black px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {loading ? "Sending..." : "Send"}
                  </button>
                </div>

                {/* Headers */}
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Headers</label>
                    <button
                      onClick={addHeader}
                      className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      + Add Header
                    </button>
                  </div>
                  <div className="space-y-2">
                    {headers.map((header) => (
                      <div key={header.id} className="flex gap-2">
                        <input
                          type="text"
                          value={header.key}
                          onChange={(e) => updateHeader(header.id, "key", e.target.value)}
                          placeholder="Header name"
                          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400"
                        />
                        <input
                          type="text"
                          value={header.value}
                          onChange={(e) => updateHeader(header.id, "value", e.target.value)}
                          placeholder="Header value"
                          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400"
                        />
                        {headers.length > 1 && (
                          <button
                            onClick={() => removeHeader(header.id)}
                            className="rounded px-2 text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Body */}
                {["POST", "PUT", "PATCH"].includes(method) && (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <label className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Body</label>
                      <div className="flex gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700">
                        <button
                          onClick={() => setBodyType("json")}
                          className={`px-3 py-1 text-xs transition-colors ${
                            bodyType === "json"
                              ? "bg-black text-white dark:bg-zinc-50 dark:text-zinc-900"
                              : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                          }`}
                        >
                          JSON
                        </button>
                        <button
                          onClick={() => setBodyType("text")}
                          className={`px-3 py-1 text-xs transition-colors ${
                            bodyType === "text"
                              ? "bg-black text-white dark:bg-zinc-50 dark:text-zinc-900"
                              : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                          }`}
                        >
                          Text
                        </button>
                        <button
                          onClick={() => setBodyType("form-data")}
                          className={`px-3 py-1 text-xs transition-colors ${
                            bodyType === "form-data"
                              ? "bg-black text-white dark:bg-zinc-50 dark:text-zinc-900"
                              : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                          }`}
                        >
                          Form Data
                        </button>
                      </div>
                    </div>
                    {bodyType === "form-data" ? (
                      <div className="space-y-2">
                        {formData.map((field) => (
                          <div key={field.id} className="flex gap-2">
                            <input
                              type="text"
                              value={field.key}
                              onChange={(e) => updateFormDataField(field.id, "key", e.target.value)}
                              placeholder="Key"
                              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400"
                            />
                            <input
                              type="text"
                              value={field.value}
                              onChange={(e) => updateFormDataField(field.id, "value", e.target.value)}
                              placeholder="Value"
                              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400"
                            />
                            <button
                              onClick={() => removeFormDataField(field.id)}
                              className="rounded px-2 text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={addFormDataField}
                          className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                        >
                          + Add Field
                        </button>
                      </div>
                    ) : (
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder={bodyType === "json" ? '{\n  "key": "value"\n}' : "Enter text..."}
                        rows={12}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 font-mono text-xs text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Response Panel */}
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">Response</h2>
                {response ? (
                  <div className="space-y-4">
                    {/* Status */}
                    <div className="flex items-center gap-4">
                      <span className={`rounded px-3 py-1 text-sm font-medium ${
                        response.status >= 200 && response.status < 300
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                          : response.status >= 400
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
                          : "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
                      }`}>
                        {response.status} {response.statusText}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {response.time}ms
                      </span>
                    </div>

                    {/* Headers */}
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">Headers</h3>
                      <div className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                        {Object.entries(response.headers).map(([key, value]) => (
                          <div key={key} className="mb-1 font-mono text-xs">
                            <span className="text-zinc-900 dark:text-zinc-50">{key}:</span>{" "}
                            <span className="text-zinc-600 dark:text-zinc-400">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Body */}
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">Body</h3>
                      <pre className="max-h-96 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50">
                        {response.body}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {loading ? "Sending request..." : "No response yet. Send a request to see the response here."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-col items-center gap-4 text-center">
              <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
                Workspace Connect
              </h1>
              <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
                Sign in with your Google account to get started
              </p>
            </div>
            <button
              onClick={handleGoogleSignIn}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-white px-6 font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 transition-all hover:bg-zinc-50 hover:shadow-md dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-700"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
