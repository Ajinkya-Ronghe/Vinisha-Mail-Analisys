import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import { readMailboxCache, writeMailboxCache } from "./mailboxCache.js";

const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.labels"
].join(" ");
const GMAIL_PAGE_SIZE = 100;
const GMAIL_DETAIL_BATCH_SIZE = 10;
const SUSPICIOUS_LABEL_NAME = "AI Suspicious";
const ATTACHMENT_SAMPLE_LIMIT = 512 * 1024;
const GOOGLE_SESSION_KEY = "maildesk.google-session.v1";
const SESSION_EXPIRY_MARGIN_MS = 60 * 1000;

const folders = [
  { id: "inbox", name: "Inbox", gmailLabel: "INBOX" },
  { id: "all", name: "All Mail" },
  { id: "starred", name: "Starred", gmailLabel: "STARRED" },
  { id: "sent", name: "Sent", gmailLabel: "SENT" },
  { id: "drafts", name: "Drafts", gmailLabel: "DRAFT" },
  { id: "archive", name: "Archive", query: "-in:inbox -in:sent -in:drafts -in:trash -in:spam" },
  { id: "spam", name: "Spam", gmailLabel: "SPAM" },
  { id: "trash", name: "Trash", gmailLabel: "TRASH" }
];

const labelFilters = ["all", SUSPICIOUS_LABEL_NAME, "Work", "Finance", "Travel"];

function App() {
  const [messages, setMessages] = useState([]);
  const [folder, setFolder] = useState("inbox");
  const [label, setLabel] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [sort, setSort] = useState("newest");
  const [accessToken, setAccessToken] = useState("");
  const [gmailReady, setGmailReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [profileEmail, setProfileEmail] = useState("vinisha@example.com");
  const [userProfile, setUserProfile] = useState({ name: "", email: "", picture: "" });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState("mail");
  const [toast, setToast] = useState("");
  const [compose, setCompose] = useState({ open: false, minimized: false, mode: "new" });
  const [composeForm, setComposeForm] = useState({ to: "", subject: "", body: "" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tokenClientRef = useRef(null);
  const toastTimerRef = useRef(0);
  const mailboxLoadsRef = useRef(new Map());
  const activeMailboxCacheRef = useRef(null);
  const sessionRestoreAttemptedRef = useRef(false);
  const profileLoadedForRef = useRef("");
  const profileMenuRef = useRef(null);

  function notify(text) {
    setToast(text);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2400);
  }

  useEffect(() => {
    function initGoogleLogin() {
      if (!GOOGLE_CLIENT_ID) return;
      if (!window.google?.accounts?.oauth2) {
        setTimeout(initGoogleLogin, 300);
        return;
      }

      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPES,
        callback: async (response) => {
          if (response.error) {
            notify(response.error);
            return;
          }
          saveGoogleSession(response);
          setAccessToken(response.access_token);
          setGmailReady(true);
          await loadGmailMailbox(response.access_token, folder, query);
        }
      });

      if (!sessionRestoreAttemptedRef.current) {
        sessionRestoreAttemptedRef.current = true;
        const session = readGoogleSession();
        if (session) {
          setAccessToken(session.accessToken);
          setGmailReady(true);
          loadGmailMailbox(session.accessToken, folder, query);
        }
      }
    }

    initGoogleLogin();
    return () => clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const context = activeMailboxCacheRef.current;
    if (!gmailReady || !context || loading || messages.some((message) => message.aiRisk?.status === "scanning")) return;
    writeMailboxCache(context.account, context.folder, context.query, messages).catch(() => {
      // Cache failures must never stop Gmail or AI analysis.
    });
  }, [messages, loading, aiScanning, gmailReady]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    function closeProfileMenu(event) {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "mousedown" && profileMenuRef.current?.contains(event.target)) return;
      setProfileMenuOpen(false);
    }
    document.addEventListener("mousedown", closeProfileMenu);
    document.addEventListener("keydown", closeProfileMenu);
    return () => {
      document.removeEventListener("mousedown", closeProfileMenu);
      document.removeEventListener("keydown", closeProfileMenu);
    };
  }, [profileMenuOpen]);

  async function requestGoogleLogin() {
    if (!GOOGLE_CLIENT_ID) {
      notify("Set VITE_GOOGLE_CLIENT_ID in .env.local first");
      return;
    }
    if (!tokenClientRef.current) {
      notify("Google sign-in is still loading");
      return;
    }
    tokenClientRef.current.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  }

  async function gmailFetch(token, path, options = {}) {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (response.status === 401) {
      signOut(false);
      throw new Error("Google session expired. Sign in again.");
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Gmail request failed: ${response.status}`);
    }

    return response.status === 204 ? null : response.json();
  }

  async function loadGoogleUserProfile(token, fallbackEmail) {
    if (profileLoadedForRef.current === fallbackEmail) return;
    profileLoadedForRef.current = fallbackEmail;
    const fallback = {
      name: displayNameFromEmail(fallbackEmail),
      email: fallbackEmail,
      picture: ""
    };
    try {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Google profile unavailable");
      const profile = await response.json();
      setUserProfile({
        name: profile.name || fallback.name,
        email: profile.email || fallback.email,
        picture: profile.picture || ""
      });
    } catch {
      setUserProfile(fallback);
    }
  }

  async function loadAttachmentSamples(message, token) {
    const attachments = await Promise.all(message.attachments.map(async (attachment) => {
      if (!attachment.attachmentId || attachment.size > ATTACHMENT_SAMPLE_LIMIT) return attachment;
      try {
        const payload = await gmailFetch(
          token,
          `messages/${message.id}/attachments/${attachment.attachmentId}`
        );
        return { ...attachment, dataBase64: payload.data || "" };
      } catch {
        return attachment;
      }
    }));
    return { ...message, attachments };
  }

  async function loadGmailMailbox(token = accessToken, nextFolder = folder, nextQuery = query, options = {}) {
    if (!token) return;

    const requestKey = `${token.slice(-12)}::${nextFolder}::${nextQuery.trim().toLowerCase()}`;
    const existing = mailboxLoadsRef.current.get(requestKey);
    if (existing) return existing;

    const request = performGmailMailboxLoad(token, nextFolder, nextQuery, options);
    mailboxLoadsRef.current.set(requestKey, request);
    try {
      return await request;
    } finally {
      mailboxLoadsRef.current.delete(requestKey);
    }
  }

  async function performGmailMailboxLoad(token, nextFolder, nextQuery, { force = false } = {}) {

    setLoading(true);
    try {
      const profile = await gmailFetch(token, "profile");
      const account = profile.emailAddress || "vinisha@example.com";
      setProfileEmail(account);
      loadGoogleUserProfile(token, account);
      activeMailboxCacheRef.current = { account, folder: nextFolder, query: nextQuery };

      if (!force) {
        let cached = null;
        try {
          cached = await readMailboxCache(account, nextFolder, nextQuery);
        } catch {
          // IndexedDB may be unavailable in private browsing; Gmail remains the fallback.
        }
        if (cached) {
          setMessages(cached.messages);
          setSelectedId((current) => cached.messages.some((message) => message.id === current) ? current : null);
          setSelectedIds(new Set());
          const cachedAt = new Date(cached.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          notify(`Opened ${cached.messages.length} cached messages from ${cachedAt}`);
          return;
        }
      }

      const folderConfig = folders.find((item) => item.id === nextFolder);
      const params = new URLSearchParams({ maxResults: String(GMAIL_PAGE_SIZE) });
      if (folderConfig?.gmailLabel) params.set("labelIds", folderConfig.gmailLabel);
      if (folderConfig?.query) params.set("q", folderConfig.query);
      if (nextQuery.trim()) params.set("q", [folderConfig?.query || "", nextQuery.trim()].join(" ").trim());
      if (nextFolder === "spam" || nextFolder === "trash") params.set("includeSpamTrash", "true");

      const ids = await listAllGmailMessageIds(token, params);
      const gmailMessages = [];
      for (let index = 0; index < ids.length; index += GMAIL_DETAIL_BATCH_SIZE) {
        const batch = ids.slice(index, index + GMAIL_DETAIL_BATCH_SIZE);
        const detail = await Promise.all(batch.map(({ id }) => gmailFetch(token, `messages/${id}?format=full`)));
        gmailMessages.push(...detail);
      }

      const normalized = gmailMessages.map((item) => normalizeGmailMessage(item, nextFolder, account));
      setMessages(normalized);
      writeMailboxCache(account, nextFolder, nextQuery, normalized).catch(() => {});
      setSelectedId((current) => normalized.some((message) => message.id === current) ? current : null);
      setSelectedIds(new Set());
      notify(`Loaded ${normalized.length} Gmail messages`);
      if (nextFolder === "inbox" && normalized.length) analyzeSuspiciousMessages(normalized, token);
    } catch (error) {
      notify(error.message.slice(0, 140));
    } finally {
      setLoading(false);
    }
  }

  async function listAllGmailMessageIds(token, params) {
    const ids = [];
    let pageToken = "";
    do {
      if (pageToken) params.set("pageToken", pageToken);
      const list = await gmailFetch(token, `messages?${params.toString()}`);
      ids.push(...(list.messages || []));
      pageToken = list.nextPageToken || "";
    } while (pageToken);
    return ids;
  }

  async function ensureSuspiciousLabel(token) {
    const list = await gmailFetch(token, "labels");
    const existing = (list.labels || []).find((item) => item.name === SUSPICIOUS_LABEL_NAME);
    if (existing) return existing.id;

    const created = await gmailFetch(token, "labels", {
      method: "POST",
      body: JSON.stringify({
        name: SUSPICIOUS_LABEL_NAME,
        labelListVisibility: "labelShow",
        messageListVisibility: "show"
      })
    });
    return created.id;
  }

  async function analyzeSuspiciousMessages(candidates, token = accessToken) {
    if (!token || aiScanning) return;

    setAiScanning(true);
    let suspiciousLabelId = "";
    let flagged = 0;

    try {
      for (const message of candidates.filter((item) => item.folder === "inbox")) {
        setMessages((current) => current.map((item) => item.id === message.id ? {
          ...item,
          aiRisk: { status: "scanning", suspicious: false, confidence: 0, reason: "Security layers are checking this message." }
        } : item));

        const messageWithSamples = await loadAttachmentSamples(message, token);
        const result = await classifyMessageWithFramework(messageWithSamples);
        if (result.suspicious) {
          flagged += 1;
          try {
            suspiciousLabelId ||= await ensureSuspiciousLabel(token);
            await gmailFetch(token, `messages/${message.id}/modify`, {
              method: "POST",
              body: JSON.stringify({ addLabelIds: [suspiciousLabelId] })
            });
          } catch {
            notify("AI flagged mail locally, but Gmail label creation needs re-consent for gmail.labels");
          }
        }

        setMessages((current) => current.map((item) => item.id === message.id ? {
          ...item,
          labels: mergeLabels(item.labels, result.suspicious ? [SUSPICIOUS_LABEL_NAME] : []),
          aiRisk: { status: "done", ...result }
        } : item));
      }

      notify(flagged ? `AI tagged ${flagged} suspicious message${flagged === 1 ? "" : "s"}` : "AI scan complete: no suspicious messages");
    } catch (error) {
      notify(`Multi-layer scan failed: ${error.message.slice(0, 90)}`);
    } finally {
      setAiScanning(false);
    }
  }

  function signOut(revoke = true) {
    if (revoke && accessToken) window.google?.accounts?.oauth2?.revoke(accessToken);
    clearGoogleSession();
    setAccessToken("");
    setGmailReady(false);
    setMessages([]);
    setUserProfile({ name: "", email: "", picture: "" });
    setProfileMenuOpen(false);
    profileLoadedForRef.current = "";
    setSelectedId(null);
    setSelectedIds(new Set());
    setCompose({ open: false, minimized: false, mode: "new" });
    notify("Signed out");
  }

  function switchGoogleAccount() {
    clearGoogleSession();
    setProfileMenuOpen(false);
    setAccessToken("");
    setGmailReady(false);
    setMessages([]);
    setSelectedId(null);
    setSelectedIds(new Set());
    setUserProfile({ name: "", email: "", picture: "" });
    profileLoadedForRef.current = "";
    setTimeout(() => tokenClientRef.current?.requestAccessToken({ prompt: "select_account" }), 0);
  }

  const visibleMessages = useMemo(() => {
    return [...messages]
      .filter((message) => label === "all" || message.labels.includes(label))
      .sort((a, b) => {
        if (sort === "oldest") return new Date(a.date) - new Date(b.date);
        if (sort === "sender") return a.from.localeCompare(b.from);
        return new Date(b.date) - new Date(a.date);
      });
  }, [messages, label, sort]);

  const counts = useMemo(() => {
    return folders.reduce((result, item) => {
      result[item.id] = item.id !== folder ? "" : messages.length;
      return result;
    }, {});
  }, [folder, messages.length]);

  const selectedMessage = messages.find((message) => message.id === selectedId);
  const mailboxTitle = folders.find((item) => item.id === folder)?.name || "Mailbox";
  const mailboxMeta = loading
    ? "Loading Gmail..."
    : aiScanning
      ? "Running multi-layer AI scan..."
    : `${visibleMessages.length} message${visibleMessages.length === 1 ? "" : "s"} from Gmail`;

  async function changeFolder(nextFolder) {
    setActiveView("mail");
    setFolder(nextFolder);
    setSelectedId(null);
    setSelectedIds(new Set());
    setSidebarOpen(false);
    await loadGmailMailbox(accessToken, nextFolder, query);
  }

  async function submitSearch(event) {
    event.preventDefault();
    setActiveView("mail");
    setSelectedIds(new Set());
    await loadGmailMailbox(accessToken, folder, query);
  }

  async function openMessage(id) {
    const message = messages.find((item) => item.id === id);
    if (!message) return;
    setSelectedId(id);
    setMessages((current) => current.map((item) => item.id === id ? { ...item, unread: false } : item));
    await gmailModify(id, { removeLabelIds: ["UNREAD"] });
  }

  async function gmailModify(id, body) {
    await gmailFetch(accessToken, `messages/${id}/modify`, { method: "POST", body: JSON.stringify(body) });
  }

  async function moveMessage(id, targetFolder) {
    if (targetFolder === "trash") await gmailFetch(accessToken, `messages/${id}/trash`, { method: "POST", body: "{}" });
    if (targetFolder === "archive") await gmailModify(id, { removeLabelIds: ["INBOX"] });
    if (targetFolder === "spam") await gmailModify(id, { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] });
    setMessages((current) => current.filter((message) => message.id !== id));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (selectedId === id) setSelectedId(null);
    notify(`Moved to ${folders.find((item) => item.id === targetFolder)?.name || targetFolder}`);
  }

  async function bulkAction(action) {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      notify("Select messages first");
      return;
    }

    for (const id of ids) {
      if (action === "read") {
        await gmailModify(id, { removeLabelIds: ["UNREAD"] });
        setMessages((current) => current.map((item) => item.id === id ? { ...item, unread: false } : item));
      }
      if (action === "archive") await moveMessage(id, "archive");
      if (action === "delete") await moveMessage(id, "trash");
      if (action === "spam") await moveMessage(id, "spam");
    }

    setSelectedIds(new Set());
    notify("Updated selected messages");
  }

  async function toggleStar(id) {
    const message = messages.find((item) => item.id === id);
    if (!message) return;
    await gmailModify(id, message.starred ? { removeLabelIds: ["STARRED"] } : { addLabelIds: ["STARRED"] });
    setMessages((current) => current.map((item) => item.id === id ? { ...item, starred: !item.starred } : item));
  }

  function toggleSelected(id, checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function setMessageGroundTruth(id, groundTruth) {
    setMessages((current) => current.map((message) => (
      message.id === id ? { ...message, groundTruth: groundTruth || "" } : message
    )));
    notify(groundTruth ? `Ground truth saved as ${titleCase(groundTruth)}` : "Ground truth removed");
  }

  function openCompose(mode = "new", source) {
    const nextForm = { to: "", subject: "", body: "" };
    if (mode === "reply" && source) {
      nextForm.to = source.email;
      nextForm.subject = source.subject.startsWith("Re:") ? source.subject : `Re: ${source.subject}`;
      nextForm.body = `\n\nOn ${formatDate(source.date)}, ${source.from} wrote:\n${source.body}`;
    }
    if (mode === "forward" && source) {
      nextForm.subject = source.subject.startsWith("Fwd:") ? source.subject : `Fwd: ${source.subject}`;
      nextForm.body = `\n\nForwarded message:\nFrom: ${source.from} <${source.email}>\nSubject: ${source.subject}\n\n${source.body}`;
    }
    setComposeForm(nextForm);
    setCompose({ open: true, minimized: false, mode });
  }

  async function sendMessage(folderTarget = "sent") {
    const raw = createMimeMessage(composeForm.to || "Draft recipient", composeForm.subject || "Untitled draft", composeForm.body || "", profileEmail);
    if (folderTarget === "sent") await gmailFetch(accessToken, "messages/send", { method: "POST", body: JSON.stringify({ raw }) });
    if (folderTarget === "drafts") await gmailFetch(accessToken, "drafts", { method: "POST", body: JSON.stringify({ message: { raw } }) });
    setCompose({ open: false, minimized: false, mode: "new" });
    await loadGmailMailbox(accessToken, folder, query, { force: true });
    notify(folderTarget === "drafts" ? "Draft saved" : "Message sent");
  }

  async function sendQuickReply(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") || "").trim();
    if (!body || !selectedMessage) return;
    const previousForm = composeForm;
    setComposeForm({
      to: selectedMessage.email,
      subject: selectedMessage.subject.startsWith("Re:") ? selectedMessage.subject : `Re: ${selectedMessage.subject}`,
      body
    });
    const raw = createMimeMessage(
      selectedMessage.email,
      selectedMessage.subject.startsWith("Re:") ? selectedMessage.subject : `Re: ${selectedMessage.subject}`,
      body,
      profileEmail
    );
    await gmailFetch(accessToken, "messages/send", { method: "POST", body: JSON.stringify({ raw }) });
    setComposeForm(previousForm);
    event.currentTarget.reset();
    notify("Reply sent");
  }

  if (!gmailReady) {
    return (
      <>
        <LoginScreen onLogin={requestGoogleLogin} />
        <Toast text={toast} />
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <Topbar
          profile={userProfile.email ? userProfile : { name: displayNameFromEmail(profileEmail), email: profileEmail, picture: "" }}
          profileMenuOpen={profileMenuOpen}
          profileMenuRef={profileMenuRef}
          query={query}
          onMenu={() => setSidebarOpen(true)}
          onProfileToggle={() => setProfileMenuOpen((current) => !current)}
          onQuery={setQuery}
          onSearch={submitSearch}
          onSignOut={() => signOut(true)}
          onSwitchAccount={switchGoogleAccount}
        />
        <AppRail activeView={activeView} onCompose={() => openCompose()} onView={setActiveView} />
        <Sidebar
          counts={counts}
          folder={folder}
          label={label}
          open={sidebarOpen}
          onCompose={() => openCompose()}
          onFolder={changeFolder}
          onLabel={setLabel}
        />
        <main className="main-panel">
          {activeView === "mail" ? (
            <>
              <CommandBar
                aiScanning={aiScanning}
                onScan={() => analyzeSuspiciousMessages(messages, accessToken)}
                onRefresh={() => loadGmailMailbox(accessToken, folder, query, { force: true })}
                onCompose={() => openCompose()}
              />
              <section className="mail-workspace" aria-label="Mail workspace">
                <MessageList
                  loading={loading}
                  mailboxMeta={mailboxMeta}
                  mailboxTitle={mailboxTitle}
                  messages={visibleMessages}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  sort={sort}
                  onBulk={bulkAction}
                  onOpen={openMessage}
                  onSelect={toggleSelected}
                  onSelectAll={(checked) => setSelectedIds(checked ? new Set(visibleMessages.map((message) => message.id)) : new Set())}
                  onSort={setSort}
                  onStar={toggleStar}
                />
                <ReadingPane
                  message={selectedMessage}
                  onGroundTruth={setMessageGroundTruth}
                  onAction={async (action) => {
                    if (!selectedMessage) return;
                    if (action === "close") setSelectedId(null);
                    if (action === "reply") openCompose("reply", selectedMessage);
                    if (action === "forward") openCompose("forward", selectedMessage);
                    if (action === "archive") await moveMessage(selectedMessage.id, "archive");
                    if (action === "delete") await moveMessage(selectedMessage.id, "trash");
                    if (action === "spam") await moveMessage(selectedMessage.id, "spam");
                    if (action === "label") notify("Custom Gmail label creation is not wired in this prototype");
                  }}
                  onQuickReply={sendQuickReply}
                />
              </section>
            </>
          ) : (
            <ResearchDashboard messages={messages} onBackToMail={() => setActiveView("mail")} />
          )}
        </main>
      </div>
      <div className={`overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <ComposeWindow
        compose={compose}
        form={composeForm}
        onChange={setComposeForm}
        onClose={() => setCompose({ open: false, minimized: false, mode: "new" })}
        onMinimize={() => setCompose((current) => ({ ...current, minimized: !current.minimized }))}
        onSaveDraft={() => sendMessage("drafts")}
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage("sent");
        }}
      />
      <Toast text={toast} />
    </>
  );
}

function LoginScreen({ onLogin }) {
  return (
    <main className="login-screen">
      <section className="login-panel" aria-label="Google sign in">
        <div className="brand-mark" aria-hidden="true">M</div>
        <h1>Sign in to continue</h1>
        <p>Connect your Google account to open your Gmail mailbox.</p>
        <button className="google-button" type="button" onClick={onLogin}>Sign in with Google</button>
      </section>
    </main>
  );
}

function AppRail({ activeView, onCompose, onView }) {
  const apps = [
    ["mail", "✉", "Mail"],
    ["research", "▥", "Research results"]
  ];
  return (
    <nav className="app-rail" aria-label="Applications">
      {apps.map(([id, glyph, name]) => (
        <button className={`rail-button ${activeView === id ? "active" : ""}`} key={id} type="button" title={name} aria-current={activeView === id ? "page" : undefined} onClick={() => onView(id)}>
          <span aria-hidden="true">{glyph}</span>
          <span className="sr-only">{name}</span>
        </button>
      ))}
      <div className="rail-spacer" />
      <button className="rail-button rail-compose" type="button" title="New mail" onClick={onCompose}>+</button>
    </nav>
  );
}

function Sidebar({ counts, folder, label, open, onCompose, onFolder, onLabel }) {
  return (
    <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Mail folders">
      <div className="folder-pane-heading">
        <strong>Mail</strong>
        <button className="pane-more" type="button" aria-label="Folder options">•••</button>
      </div>
      <button className="compose-primary" type="button" onClick={onCompose}>
        <span className="new-mail-icon" aria-hidden="true">＋</span>
        New mail
      </button>
      <div className="folder-group-title"><span aria-hidden="true">⌄</span> Favorites</div>
      <button className={`folder-button ${folder === "inbox" ? "active" : ""}`} type="button" onClick={() => onFolder("inbox")}>
        <span className="folder-left"><span className="folder-glyph" aria-hidden="true">▣</span>Inbox</span>
        <span className="folder-count">{counts.inbox}</span>
      </button>
      <div className="folder-group-title"><span aria-hidden="true">⌄</span> Folders</div>
      <nav className="folder-list" aria-label="Folders">
        {folders.map((item) => (
          <button className={`folder-button ${folder === item.id ? "active" : ""}`} key={item.id} type="button" onClick={() => onFolder(item.id)}>
            <span className="folder-left"><span className="folder-glyph" aria-hidden="true">{folderGlyph(item.id)}</span>{item.name}</span>
            <span className="folder-count">{counts[item.id]}</span>
          </button>
        ))}
      </nav>
      <div className="label-block">
        <div className="section-title">Labels</div>
        {labelFilters.map((item) => (
          <button className={`label-filter ${label === item ? "active" : ""}`} key={item} type="button" onClick={() => onLabel(item)}>
            <span className={`label-dot ${labelDotClass(item)}`}></span>
            {item === "all" ? "All labels" : item}
          </button>
        ))}
      </div>
    </aside>
  );
}

function Topbar({ profile, profileMenuOpen, profileMenuRef, query, onMenu, onProfileToggle, onQuery, onSearch, onSignOut, onSwitchAccount }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <button className="app-launcher" type="button" aria-label="App launcher">
          {Array.from({ length: 9 }, (_, index) => <span key={index} />)}
        </button>
        <button className="mobile-menu" type="button" aria-label="Open folders" onClick={onMenu}>☰</button>
        <span className="outlook-mark" aria-hidden="true">M</span>
        <strong>MailDesk</strong>
      </div>
      <form className="search-box" role="search" onSubmit={onSearch}>
        <span className="search-glyph" aria-hidden="true">⌕</span>
        <input type="search" placeholder="Search" value={query} onChange={(event) => onQuery(event.target.value)} />
        <button className="search-submit" type="submit" aria-label="Search">→</button>
      </form>
      <div className="account-actions">
        <button className="topbar-icon" type="button" aria-label="Settings" title="Settings">⚙</button>
        <button className="topbar-icon" type="button" aria-label="Help" title="Help">?</button>
        <div className="profile-menu-wrapper" ref={profileMenuRef}>
          <button className="profile-button" type="button" aria-label="Account manager" aria-expanded={profileMenuOpen} onClick={onProfileToggle}>
            {profile.picture ? <img src={profile.picture} alt="" referrerPolicy="no-referrer" /> : profileInitials(profile.name || profile.email)}
            <span className="presence-dot" aria-hidden="true" />
          </button>
          {profileMenuOpen && (
            <section className="profile-menu" aria-label="Account options">
              <div className="profile-menu-header">
                <div className="profile-avatar-large">
                  {profile.picture ? <img src={profile.picture} alt="" referrerPolicy="no-referrer" /> : profileInitials(profile.name || profile.email)}
                </div>
                <div>
                  <strong>{profile.name || displayNameFromEmail(profile.email)}</strong>
                  <span>{profile.email}</span>
                  <small>Google account · Connected</small>
                </div>
              </div>
              <a className="account-link" href="https://myaccount.google.com/" target="_blank" rel="noreferrer">View account</a>
              <div className="profile-menu-actions">
                <button type="button" onClick={onSwitchAccount}><span aria-hidden="true">⇄</span> Switch account</button>
                <button type="button" onClick={onSignOut}><span aria-hidden="true">↪</span> Sign out</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </header>
  );
}

function CommandBar({ aiScanning, onCompose, onRefresh, onScan }) {
  return (
    <div className="command-bar" aria-label="Mail commands">
      <button className="command-primary" type="button" onClick={onCompose}><span aria-hidden="true">＋</span> New mail</button>
      <span className="command-divider" />
      <button className="command-button" type="button" onClick={onRefresh}><span aria-hidden="true">↻</span> Refresh</button>
      <button className="command-button ai-command" type="button" onClick={onScan} disabled={aiScanning}>
        <span aria-hidden="true">✦</span> {aiScanning ? "Scanning…" : "AI scan"}
      </button>
      <span className="command-divider" />
      <button className="command-button" type="button"><span aria-hidden="true">⋯</span> More</button>
    </div>
  );
}

function ResearchDashboard({ messages, onBackToMail }) {
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationError, setEvaluationError] = useState("");
  const analyzed = useMemo(
    () => messages.filter((message) => message.aiRisk?.status === "done"),
    [messages]
  );
  const summary = useMemo(() => {
    const result = { safe: 0, threat: 0, phishing: 0, malware: 0 };
    analyzed.forEach((message) => {
      const category = message.aiRisk?.category || "safe";
      if (category in result) result[category] += 1;
    });
    return result;
  }, [analyzed]);
  const mailboxMetrics = useMemo(() => calculateMailboxMetrics(messages), [messages]);
  const anomalyCount = analyzed.filter((message) => (
    Number(message.aiRisk?.layers?.anomaly_detection?.score || 0) >= 0.55
  )).length;
  const averageRisk = analyzed.length
    ? analyzed.reduce((total, message) => total + Number(message.aiRisk.riskScore || 0), 0) / analyzed.length
    : 0;

  useEffect(() => {
    let active = true;
    fetch("/api/evaluation")
      .then((response) => {
        if (!response.ok) throw new Error("Run the Python evaluation command to create the report.");
        return response.json();
      })
      .then((result) => active && setEvaluation(result))
      .catch((error) => active && setEvaluationError(error.message));
    return () => { active = false; };
  }, []);

  const bootstrapModels = Object.entries(evaluation?.models || {});
  const ensemble = evaluation?.models?.soft_voting_ensemble;

  return (
    <section className="research-dashboard" aria-label="Research results dashboard">
      <header className="research-header">
        <div>
          <span className="research-eyebrow">PhD implementation evidence</span>
          <h1>Multi-layer defense evaluation</h1>
          <p>Mailbox observations, ground-truth validation, baseline comparisons and model-level results.</p>
        </div>
        <div className="research-actions">
          <button className="secondary-button" type="button" onClick={onBackToMail}>Back to mail</button>
          <button className="command-primary" type="button" onClick={() => exportExperimentResults(messages)}>Export results</button>
        </div>
      </header>

      <div className="research-warning">
        <strong>Research validity notice</strong>
        <span>Bootstrap figures verify the software pipeline only. Thesis claims require independent real, synthetic, temporal and unseen test datasets.</span>
      </div>

      <div className="metric-cards">
        <MetricCard label="Messages analysed" value={analyzed.length} detail={`${messages.length - analyzed.length} awaiting analysis`} />
        <MetricCard label="Average risk" value={formatPercent(averageRisk)} detail="Weighted ensemble score" />
        <MetricCard label="Flagged suspicious" value={analyzed.filter((message) => message.aiRisk.suspicious).length} detail="Above decision threshold" />
        <MetricCard label="Anomaly indicators" value={anomalyCount} detail="Zero-day proxy; not proof" />
        <MetricCard label="Ground-truth labels" value={mailboxMetrics.sampleCount} detail="Manually validated emails" />
        <MetricCard label="Mailbox accuracy" value={mailboxMetrics.sampleCount ? formatPercent(mailboxMetrics.accuracy) : "—"} detail="Requires ground-truth labels" />
      </div>

      <div className="research-grid">
        <article className="research-panel category-panel">
          <div className="panel-title">
            <div><span>Current mailbox</span><h2>Predicted categories</h2></div>
            <small>{analyzed.length} classified</small>
          </div>
          <div className="category-bars">
            {Object.entries(summary).map(([category, count]) => (
              <div className="category-row" key={category}>
                <span>{titleCase(category)}</span>
                <div className="category-track"><i className={`category-fill category-${category}`} style={{ width: `${analyzed.length ? (count / analyzed.length) * 100 : 0}%` }} /></div>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="research-panel">
          <div className="panel-title">
            <div><span>Live labelled sample</span><h2>Mailbox confusion matrix</h2></div>
            <small>{mailboxMetrics.sampleCount} samples</small>
          </div>
          {mailboxMetrics.sampleCount ? (
            <ConfusionMatrix matrix={mailboxMetrics.matrix} labels={mailboxMetrics.labels} />
          ) : (
            <ResearchEmpty text="Open test emails and assign a Research ground truth label to calculate live metrics." />
          )}
        </article>

        <article className="research-panel model-comparison">
          <div className="panel-title">
            <div><span>Bootstrap hold-out</span><h2>Model comparison</h2></div>
            <small>{evaluation ? `${evaluation.test_samples} test samples` : "Loading"}</small>
          </div>
          {evaluationError && <ResearchEmpty text={evaluationError} />}
          {!evaluationError && !evaluation && <ResearchEmpty text="Loading evaluation report…" />}
          {bootstrapModels.length > 0 && (
            <div className="model-table" role="table" aria-label="Model accuracy comparison">
              <div className="model-table-row model-table-head" role="row"><span>Model</span><span>Accuracy</span><span>Macro F1</span></div>
              {bootstrapModels.map(([name, result]) => (
                <div className="model-table-row" role="row" key={name}>
                  <strong>{modelDisplayName(name)}</strong>
                  <span>{formatPercent(result.accuracy)}</span>
                  <span>{result.classification_report?.["macro avg"] ? formatPercent(result.classification_report["macro avg"]["f1-score"]) : "Binary baseline"}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="research-panel">
          <div className="panel-title">
            <div><span>Soft voting ensemble</span><h2>Bootstrap confusion matrix</h2></div>
          </div>
          {ensemble ? <ConfusionMatrix matrix={ensemble.confusion_matrix} labels={evaluation.labels} /> : <ResearchEmpty text="Evaluation report unavailable." />}
        </article>
      </div>

      {mailboxMetrics.sampleCount > 0 && (
        <article className="research-panel class-metrics-panel">
          <div className="panel-title"><div><span>Current mailbox</span><h2>Precision, recall and F1 by category</h2></div></div>
          <div className="class-metrics-table">
            <div className="class-metrics-row class-metrics-head"><span>Category</span><span>Precision</span><span>Recall</span><span>F1</span><span>Support</span></div>
            {mailboxMetrics.labels.map((label) => (
              <div className="class-metrics-row" key={label}>
                <strong>{titleCase(label)}</strong>
                <span>{formatPercent(mailboxMetrics.perClass[label].precision)}</span>
                <span>{formatPercent(mailboxMetrics.perClass[label].recall)}</span>
                <span>{formatPercent(mailboxMetrics.perClass[label].f1)}</span>
                <span>{mailboxMetrics.perClass[label].support}</span>
              </div>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}

function MetricCard({ label, value, detail }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function ResearchEmpty({ text }) {
  return <div className="research-empty">{text}</div>;
}

function ConfusionMatrix({ matrix, labels }) {
  const maximum = Math.max(1, ...matrix.flat());
  return (
    <div className="confusion-wrap">
      <span className="confusion-axis predicted-axis">Predicted class →</span>
      <span className="confusion-axis actual-axis">Actual class →</span>
      <div className="confusion-matrix" style={{ gridTemplateColumns: `72px repeat(${labels.length}, minmax(42px, 1fr))` }}>
        <span />
        {labels.map((label) => <strong className="matrix-label" key={`top-${label}`}>{shortCategory(label)}</strong>)}
        {matrix.map((row, rowIndex) => (
          <React.Fragment key={labels[rowIndex]}>
            <strong className="matrix-label row-label">{shortCategory(labels[rowIndex])}</strong>
            {row.map((value, columnIndex) => (
              <span
                className={`matrix-cell ${rowIndex === columnIndex ? "correct" : "error"}`}
                key={`${rowIndex}-${columnIndex}`}
                style={{ "--cell-opacity": 0.12 + (value / maximum) * 0.7 }}
                title={`Actual ${labels[rowIndex]}, predicted ${labels[columnIndex]}: ${value}`}
              >{value}</span>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function MessageList({ loading, mailboxMeta, mailboxTitle, messages, selectedId, selectedIds, sort, onBulk, onOpen, onSelect, onSelectAll, onSort, onStar }) {
  const allSelected = messages.length > 0 && messages.every((message) => selectedIds.has(message.id));

  return (
    <section className="message-list-panel" aria-label="Message list">
      <div className="list-toolbar">
        <label className="check-control">
          <input type="checkbox" checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} />
          <span>Select</span>
        </label>
        <div className="toolbar-actions">
          {["archive", "delete", "read", "spam"].map((action) => (
            <button className="tool-button" key={action} type="button" onClick={() => onBulk(action)}>{titleCase(action)}</button>
          ))}
        </div>
      </div>
      <div className="mailbox-heading">
        <div>
          <h1>{mailboxTitle}</h1>
          <p>{mailboxMeta}</p>
        </div>
        <select aria-label="Sort messages" value={sort} onChange={(event) => onSort(event.target.value)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="sender">Sender</option>
        </select>
      </div>
      <div className="message-list">
        {loading && <EmptyState title="Loading Gmail" text="Fetching your latest messages from Google." />}
        {!loading && !messages.length && <EmptyState title="No messages found" text="Try another folder, label, or search phrase." />}
        {!loading && messages.map((message) => (
          <article className={`message-row ${message.unread ? "unread" : ""} ${selectedId === message.id ? "active" : ""}`} key={message.id}>
            <input className="row-check" type="checkbox" checked={selectedIds.has(message.id)} onChange={(event) => onSelect(message.id, event.target.checked)} aria-label={`Select ${message.subject}`} />
            <button className="message-summary" type="button" onClick={() => onOpen(message.id)}>
              <div className="row-top">
                <span className="sender">{message.from}</span>
                <span className="row-meta">{formatDate(message.date)}</span>
              </div>
              <div className="subject">{message.subject}</div>
              <div className="snippet">{message.body.replace(/\s+/g, " ").slice(0, 120)}</div>
              <div className="row-meta">
                <span>{message.labels.map((item) => <span className={`chip ${item === SUSPICIOUS_LABEL_NAME ? "chip-danger" : ""}`} key={item}>{item}</span>)}</span>
                <span className="row-flags">
                  {message.aiRisk?.status === "scanning" && <span className="ai-chip">AI checking</span>}
                  {message.aiRisk?.status === "done" && message.aiRisk.suspicious && <span className="ai-chip danger">Risk {Math.round(message.aiRisk.confidence * 100)}%</span>}
                  {message.attachments.length ? `${message.attachments.length} attachment${message.attachments.length === 1 ? "" : "s"}` : ""}
                </span>
              </div>
            </button>
            <button className={`star-button ${message.starred ? "active" : ""}`} type="button" onClick={() => onStar(message.id)} aria-label="Star message">
              {message.starred ? "Starred" : "Star"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReadingPane({ message, onAction, onGroundTruth, onQuickReply }) {
  return (
    <section className={`reading-pane ${message ? "has-message" : ""}`} aria-label="Selected message">
      {!message && <EmptyState title="Select a message" text="Open any mail to read, reply, forward, label, archive, or delete it." />}
      {message && (
        <article className="read-message">
          <div className="read-header">
            <div>
              <h2>{message.subject}</h2>
              <div className="contact-line">From: {message.from} &lt;{message.email}&gt;</div>
              <div className="contact-line">To: {message.to} | {formatDate(message.date)}</div>
              <div className="contact-line">Labels: {message.labels.join(", ") || "None"}</div>
              {message.aiRisk && (
                <div className={`ai-risk ${message.aiRisk.suspicious ? "danger" : ""}`}>
                  <strong>{message.aiRisk.status === "scanning" ? "AI checking" : message.aiRisk.suspicious ? "Suspicious mail" : "AI check passed"}</strong>
                  {message.aiRisk.status === "done" && (
                    <>
                      <span>
                        Category: {titleCase(message.aiRisk.category || "safe")} · Risk {Math.round(message.aiRisk.riskScore * 100)}% · {message.aiRisk.reason}
                      </span>
                      <div className="layer-results">
                        {Object.entries(message.aiRisk.layers || {}).map(([name, layer]) => (
                          <span className={`layer-chip ${layer.score >= 0.48 ? "danger" : ""}`} key={name} title={(layer.findings || []).join("; ")}>
                            {titleCase(name.replaceAll("_", " "))}: {Math.round(layer.score * 100)}%
                          </span>
                        ))}
                      </div>
                      {message.aiRisk.indicators?.length > 0 && (
                        <span>Indicators: {message.aiRisk.indicators.slice(0, 3).join("; ")}</span>
                      )}
                    </>
                  )}
                </div>
              )}
              <label className="ground-truth-control">
                <span>Research ground truth</span>
                <select value={message.groundTruth || ""} onChange={(event) => onGroundTruth(message.id, event.target.value)}>
                  <option value="">Not labelled</option>
                  <option value="safe">Safe</option>
                  <option value="threat">Threat / Malicious</option>
                  <option value="phishing">Phishing</option>
                  <option value="malware">Malware</option>
                </select>
              </label>
            </div>
            <div className="read-actions">
              {["close", "reply", "forward", "archive", "delete", "spam", "label"].map((action) => (
                <button className={`tool-button ${action === "close" ? "close-read" : ""}`} key={action} type="button" onClick={() => onAction(action)}>{titleCase(action === "close" ? "back" : action)}</button>
              ))}
            </div>
          </div>
          <div className="message-body">{message.body}</div>
          {message.attachments.length > 0 && <p className="chip">Attachment: {message.attachments.map((item) => item.name).join(", ")}</p>}
          <form className="quick-reply" onSubmit={onQuickReply}>
            <textarea name="body" placeholder={`Quick reply to ${message.from}`}></textarea>
            <button className="send-button" type="submit">Send reply</button>
          </form>
        </article>
      )}
    </section>
  );
}

function ComposeWindow({ compose, form, onChange, onClose, onMinimize, onSaveDraft, onSubmit }) {
  return (
    <section className={`compose-window ${compose.open ? "open" : ""} ${compose.minimized ? "minimized" : ""}`} aria-label="Compose email" aria-hidden={!compose.open}>
      <header>
        <strong>{compose.mode === "reply" ? "Reply" : compose.mode === "forward" ? "Forward" : "New message"}</strong>
        <div>
          <button className="icon-button" type="button" onClick={onMinimize}>Min</button>
          <button className="icon-button" type="button" onClick={onClose}>Close</button>
        </div>
      </header>
      <form onSubmit={onSubmit}>
        <input type="email" placeholder="To" required value={form.to} onChange={(event) => onChange({ ...form, to: event.target.value })} />
        <input type="text" placeholder="Subject" required value={form.subject} onChange={(event) => onChange({ ...form, subject: event.target.value })} />
        <textarea placeholder="Write your message" required value={form.body} onChange={(event) => onChange({ ...form, body: event.target.value })}></textarea>
        <footer>
          <button className="send-button" type="submit">Send</button>
          <button className="secondary-button" type="button" onClick={onSaveDraft}>Save draft</button>
          <button className="secondary-button" type="button" onClick={onClose}>Discard</button>
        </footer>
      </form>
    </section>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function Toast({ text }) {
  return <div className={`toast ${text ? "show" : ""}`} role="status" aria-live="polite">{text}</div>;
}

async function classifyMessageWithFramework(message) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message_id: message.id,
      sender_name: message.from,
      sender_email: message.email,
      recipient: message.to,
      subject: message.subject,
      body: message.body.slice(0, 12000),
      headers: message.headers,
      attachments: message.attachments.map((item) => ({
        name: item.name,
        mime_type: item.mimeType,
        size: item.size,
        data_base64: item.dataBase64 || null
      }))
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Analysis API failed: ${response.status}`);
  }

  const result = await response.json();
  return {
    suspicious: Boolean(result.suspicious),
    category: result.category,
    confidence: clamp(Number(result.confidence) || 0, 0, 1),
    riskScore: clamp(Number(result.risk_score) || 0, 0, 1),
    reason: String(result.reason || "No reason returned.").slice(0, 220),
    indicators: result.indicators || [],
    layers: result.layers || {},
    modelScores: result.model_scores || {}
  };
}

function mergeLabels(existing, additions) {
  return Array.from(new Set([...(existing || []), ...additions]));
}

function normalizeGmailMessage(raw, folder, fallbackEmail) {
  const headers = raw.payload?.headers || [];
  const header = (name) => headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
  const headerMap = headers.reduce((result, item) => {
    const name = item.name.toLowerCase();
    result[name] = result[name] ? `${result[name]}\n${item.value}` : item.value;
    return result;
  }, {});
  const from = parseAddress(header("From"));
  const labelIds = raw.labelIds || [];
  return {
    id: raw.id,
    threadId: raw.threadId,
    folder,
    from: from.name || from.email || "Unknown sender",
    email: from.email,
    to: header("To") || fallbackEmail,
    subject: header("Subject") || "(No subject)",
    body: extractBody(raw.payload) || raw.snippet || "",
    date: header("Date") ? new Date(header("Date")).toISOString() : new Date(Number(raw.internalDate)).toISOString(),
    unread: labelIds.includes("UNREAD"),
    starred: labelIds.includes("STARRED"),
    labels: visibleGmailLabels(labelIds),
    attachments: collectAttachments(raw.payload),
    headers: headerMap
  };
}

function parseAddress(value) {
  const match = value.match(/^(.*)<(.+)>$/);
  if (!match) return { name: value.replaceAll('"', "").trim(), email: value.trim() };
  return { name: match[1].replaceAll('"', "").trim(), email: match[2].trim() };
}

function visibleGmailLabels(labelIds) {
  const system = new Set(["INBOX", "UNREAD", "STARRED", "IMPORTANT", "CATEGORY_PERSONAL", "SENT", "DRAFT", "TRASH", "SPAM"]);
  const custom = labelIds.filter((item) => !system.has(item));
  if (custom.length) return custom;
  if (labelIds.includes("INBOX")) return ["Inbox"];
  if (labelIds.includes("SENT")) return ["Sent"];
  if (labelIds.includes("DRAFT")) return ["Draft"];
  return ["Gmail"];
}

function extractBody(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  if (part.parts?.length) {
    const plain = part.parts.map(extractBody).find(Boolean);
    if (plain) return plain;
    const html = part.parts.find((item) => item.mimeType === "text/html" && item.body?.data);
    if (html) return stripHtml(decodeBase64Url(html.body.data));
  }
  if (part.body?.data) return stripHtml(decodeBase64Url(part.body.data));
  return "";
}

function collectAttachments(part, attachments = []) {
  if (!part) return attachments;
  if (part.filename) {
    attachments.push({
      name: part.filename,
      mimeType: part.mimeType || "application/octet-stream",
      size: Number(part.body?.size || 0),
      attachmentId: part.body?.attachmentId || "",
      dataBase64: part.body?.data || ""
    });
  }
  (part.parts || []).forEach((child) => collectAttachments(child, attachments));
  return attachments;
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function stripHtml(value) {
  const node = document.createElement("div");
  node.innerHTML = value;
  node.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (href && !anchor.textContent.includes(href)) anchor.append(` (${href})`);
  });
  return node.textContent || node.innerText || "";
}

function createMimeMessage(to, subject, body, from) {
  const message = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body
  ].join("\r\n");
  return btoa(unescape(encodeURIComponent(message))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function labelDotClass(label) {
  if (label === SUSPICIOUS_LABEL_NAME) return "dot-suspicious";
  return `dot-${label.toLowerCase()}`;
}

function folderGlyph(folder) {
  const glyphs = {
    inbox: "▣",
    all: "▤",
    starred: "☆",
    sent: "➤",
    drafts: "▧",
    archive: "▱",
    spam: "⊘",
    trash: "♲"
  };
  return glyphs[folder] || "□";
}

function displayNameFromEmail(email) {
  const name = String(email || "User").split("@")[0].replace(/[._-]+/g, " ").trim();
  return name.split(/\s+/).filter(Boolean).map((part) => titleCase(part)).join(" ") || "User";
}

function profileInitials(value) {
  const parts = String(value || "User").replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function calculateMailboxMetrics(messages) {
  const labels = ["safe", "threat", "phishing", "malware"];
  const samples = messages.filter((message) => (
    labels.includes(message.groundTruth) && message.aiRisk?.status === "done" && labels.includes(message.aiRisk.category)
  ));
  const matrix = labels.map(() => labels.map(() => 0));
  samples.forEach((message) => {
    matrix[labels.indexOf(message.groundTruth)][labels.indexOf(message.aiRisk.category)] += 1;
  });
  const perClass = {};
  labels.forEach((label, index) => {
    const truePositive = matrix[index][index];
    const falsePositive = matrix.reduce((total, row, rowIndex) => total + (rowIndex === index ? 0 : row[index]), 0);
    const falseNegative = matrix[index].reduce((total, value, columnIndex) => total + (columnIndex === index ? 0 : value), 0);
    const support = matrix[index].reduce((total, value) => total + value, 0);
    const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
    const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
    perClass[label] = {
      precision,
      recall,
      f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
      support
    };
  });
  const correct = matrix.reduce((total, row, index) => total + row[index], 0);
  return {
    labels,
    matrix,
    perClass,
    sampleCount: samples.length,
    accuracy: samples.length ? correct / samples.length : 0
  };
}

function exportExperimentResults(messages) {
  const metrics = calculateMailboxMetrics(messages);
  const report = {
    generatedAt: new Date().toISOString(),
    notice: "Mailbox experiment export. Validate dataset provenance and ground-truth labels before research use.",
    metrics,
    samples: messages.map((message) => ({
      messageId: message.id,
      date: message.date,
      sender: message.email,
      subject: message.subject,
      groundTruth: message.groundTruth || null,
      prediction: message.aiRisk?.category || null,
      suspicious: message.aiRisk?.suspicious ?? null,
      riskScore: message.aiRisk?.riskScore ?? null,
      indicators: message.aiRisk?.indicators || [],
      layerScores: Object.fromEntries(Object.entries(message.aiRisk?.layers || {}).map(([name, layer]) => [name, layer.score]))
    }))
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `maildesk-experiment-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function modelDisplayName(name) {
  const names = {
    logistic_regression: "Logistic Regression",
    random_forest: "Random Forest",
    xgboost: "XGBoost",
    neural_classifier: "Neural Classifier",
    soft_voting_ensemble: "Soft-voting Ensemble",
    rule_based_binary_baseline: "Rule-based Baseline"
  };
  return names[name] || name;
}

function shortCategory(value) {
  const names = { safe: "Safe", threat: "Threat", phishing: "Phish", malware: "Malware" };
  return names[value] || titleCase(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function saveGoogleSession(response) {
  if (!response?.access_token) return;
  const expiresInSeconds = Math.max(60, Number(response.expires_in) || 3600);
  const session = {
    accessToken: response.access_token,
    clientId: GOOGLE_CLIENT_ID,
    expiresAt: Date.now() + expiresInSeconds * 1000 - SESSION_EXPIRY_MARGIN_MS
  };
  try {
    window.sessionStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable in restrictive/private browsing modes.
  }
}

function readGoogleSession() {
  try {
    const session = JSON.parse(window.sessionStorage.getItem(GOOGLE_SESSION_KEY) || "null");
    const valid = session?.accessToken
      && session.clientId === GOOGLE_CLIENT_ID
      && Number(session.expiresAt) > Date.now();
    if (valid) return session;
  } catch {
    // Invalid session data is removed below.
  }
  clearGoogleSession();
  return null;
}

function clearGoogleSession() {
  try {
    window.sessionStorage.removeItem(GOOGLE_SESSION_KEY);
  } catch {
    // There is nothing else to clear when browser storage is unavailable.
  }
}

createRoot(document.querySelector("#root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
