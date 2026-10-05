(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const config = window.TODO_SUPABASE_CONFIG;
  const client = window.supabase?.createClient && config?.url && config?.anonKey
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;
  const elements = {
    child: $("#child-select"),
    date: $("#reading-date"),
    dailySummary: $("#daily-summary"),
    accessStatus: $("#access-status"),
    unlock: $("#unlock-button"),
    lock: $("#lock-button"),
    form: $("#reading-form"),
    formHeading: $("#form-heading"),
    title: $("#book-title"),
    pageFrom: $("#page-from"),
    pageTo: $("#page-to"),
    save: $("#save-button"),
    cancelEdit: $("#cancel-edit"),
    formMessage: $("#form-message"),
    recordCount: $("#record-count"),
    records: $("#records-list"),
    pinDialog: $("#pin-dialog"),
    pinForm: $("#pin-form"),
    pinHeading: $("#pin-heading"),
    pinInput: $("#pin-input"),
    pinError: $("#pin-error"),
    closePin: $("#close-pin"),
  };

  let children = [];
  let records = [];
  let session = null;
  let editingId = null;
  let recordsRequestId = 0;

  function todayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function selectedChild() {
    return children.find((child) => child.id === elements.child.value);
  }

  function setFormMessage(message, isError) {
    elements.formMessage.textContent = message;
    elements.formMessage.classList.toggle("error-message", Boolean(isError));
    elements.formMessage.hidden = !message;
  }

  function renderRecords() {
    const child = selectedChild();
    const totalPages = records.reduce((total, record) =>
      total + Number(record.page_to) - Number(record.page_from) + 1, 0);
    elements.recordCount.textContent = `${records.length}권`;
    elements.dailySummary.textContent = `${records.length}권 · ${totalPages}페이지`;

    if (!child) {
      elements.records.innerHTML = '<p class="empty-message">등록된 자녀가 없어요. 먼저 할 일표에서 자녀를 등록해 주세요.</p>';
      return;
    }
    if (records.length === 0) {
      elements.records.innerHTML = '<p class="empty-message">이 날짜에 기록된 책이 없어요. 첫 독서 기록을 남겨 보세요.</p>';
      return;
    }
    const canManage = session?.childId === child.id;
    elements.records.innerHTML = records.map((record) => `
      <article class="record-card">
        <span class="record-icon" aria-hidden="true">📖</span>
        <div class="record-copy">
          <h4 class="record-title">${escapeHtml(record.title)}</h4>
          <p class="record-pages">${Number(record.page_from)}~${Number(record.page_to)}페이지 · ${Number(record.page_to) - Number(record.page_from) + 1}페이지 읽음</p>
        </div>
        ${canManage ? `<div class="record-actions">
          <button class="record-action" type="button" data-action="edit" data-id="${escapeHtml(record.id)}">수정</button>
          <button class="record-action delete" type="button" data-action="delete" data-id="${escapeHtml(record.id)}">삭제</button>
        </div>` : ""}
      </article>
    `).join("");
  }

  function renderAccess() {
    const child = selectedChild();
    const unlocked = Boolean(child && session?.childId === child.id);
    elements.accessStatus.textContent = child
      ? (unlocked ? `${child.name}님으로 기록을 관리하고 있어요.` : "기록을 추가하거나 수정하려면 자녀 PIN을 입력해 주세요.")
      : "먼저 할 일표에서 자녀를 등록해 주세요.";
    elements.unlock.hidden = !child || unlocked;
    elements.lock.hidden = !unlocked;
    elements.form.querySelectorAll("input, button").forEach((control) => {
      control.disabled = !unlocked;
    });
    elements.cancelEdit.disabled = !unlocked;
    renderRecords();
  }

  function resetForm() {
    elements.form.reset();
    editingId = null;
    elements.formHeading.textContent = "읽은 책 추가";
    elements.save.textContent = "기록 저장";
    elements.cancelEdit.hidden = true;
    setFormMessage("", false);
  }

  async function loadRecords() {
    const requestId = ++recordsRequestId;
    const child = selectedChild();
    if (!child) {
      records = [];
      renderRecords();
      return;
    }
    elements.records.innerHTML = '<p class="empty-message">기록을 불러오는 중이에요.</p>';
    const { data, error } = await client
      .from("book_reading_records")
      .select("id, child_id, reading_date, title, page_from, page_to")
      .eq("child_id", child.id)
      .eq("reading_date", elements.date.value)
      .order("created_at", { ascending: true });
    if (requestId !== recordsRequestId) return;
    if (error) throw error;
    records = data;
    renderRecords();
  }

  async function lockSession() {
    if (!session) return;
    const previousSession = session;
    session = null;
    renderAccess();
    const { error } = await client.rpc("lock_child_session", {
      p_child_id: previousSession.childId,
      p_child_token: previousSession.token,
    });
    if (error) throw error;
  }

  async function initialize() {
    elements.date.value = todayString();
    if (!client) throw new Error("Supabase 연결 설정이 필요합니다. supabase-config.js를 확인해 주세요.");
    const { data, error } = await client
      .from("family_state")
      .select("children")
      .eq("id", 1)
      .single();
    if (error) throw error;
    children = Array.isArray(data.children)
      ? data.children.filter((child) => child && typeof child.id === "string" && typeof child.name === "string")
      : [];
    elements.child.innerHTML = children.map((child) =>
      `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`
    ).join("");
    elements.child.disabled = children.length === 0;
    renderAccess();
    await loadRecords();
    renderAccess();
  }

  elements.child.addEventListener("change", async () => {
    resetForm();
    try {
      await lockSession();
    } catch (error) {
      console.error("이전 자녀 세션을 잠그지 못했습니다.", error);
      setFormMessage(`이전 세션 잠금에 실패했습니다. ${error.message}`, true);
    }
    try {
      await loadRecords();
      renderAccess();
    } catch (error) {
      console.error("자녀별 독서 기록을 불러오지 못했습니다.", error);
      elements.records.innerHTML = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
    }
  });

  elements.date.addEventListener("change", async () => {
    resetForm();
    if (!elements.date.value) {
      records = [];
      renderRecords();
      return;
    }
    try {
      await loadRecords();
    } catch (error) {
      console.error("독서 기록을 불러오지 못했습니다.", error);
      elements.records.innerHTML = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
    }
  });

  elements.unlock.addEventListener("click", () => {
    const child = selectedChild();
    if (!child) return;
    elements.pinForm.reset();
    elements.pinError.hidden = true;
    elements.pinHeading.textContent = `${child.name}님 PIN 입력`;
    elements.pinDialog.showModal();
    elements.pinInput.focus();
  });

  elements.closePin.addEventListener("click", () => elements.pinDialog.close());

  elements.pinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const child = selectedChild();
    if (!child) return;
    try {
      const { data, error } = await client.rpc("verify_child_pin", {
        p_child_id: child.id,
        p_pin: elements.pinInput.value,
      });
      if (error) throw error;
      if (!data) {
        elements.pinError.textContent = "PIN을 확인해 주세요. 5회 연속 실패하면 5분간 잠겨요.";
        elements.pinError.hidden = false;
        elements.pinInput.select();
        return;
      }
      session = { childId: child.id, token: data };
      elements.pinDialog.close();
      renderAccess();
    } catch (error) {
      console.error("자녀 PIN 확인에 실패했습니다.", error);
      elements.pinError.textContent = `PIN 확인에 실패했습니다. ${error.message}`;
      elements.pinError.hidden = false;
    }
  });

  elements.lock.addEventListener("click", async () => {
    try {
      await lockSession();
      resetForm();
      renderAccess();
    } catch (error) {
      console.error("자녀 세션을 잠그지 못했습니다.", error);
      setFormMessage(`잠금 처리에 실패했습니다. ${error.message}`, true);
    }
  });

  elements.cancelEdit.addEventListener("click", resetForm);

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const child = selectedChild();
    if (!child || session?.childId !== child.id) {
      setFormMessage("먼저 자녀 PIN을 입력해 주세요.", true);
      return;
    }
    const pageFrom = Number(elements.pageFrom.value);
    const pageTo = Number(elements.pageTo.value);
    const title = elements.title.value.trim();
    if (!elements.date.value || !title || title.length > 200 || !Number.isInteger(pageFrom) ||
        !Number.isInteger(pageTo) || pageFrom < 1 || pageTo < pageFrom || pageTo > 100000) {
      setFormMessage("책 제목과 올바른 페이지 범위를 입력해 주세요.", true);
      return;
    }

    elements.save.disabled = true;
    try {
      const { error } = await client.rpc("save_book_reading", {
        p_id: editingId,
        p_child_id: child.id,
        p_reading_date: elements.date.value,
        p_title: title,
        p_page_from: pageFrom,
        p_page_to: pageTo,
        p_child_token: session.token,
      });
      if (error) throw error;
      resetForm();
      await loadRecords();
    } catch (error) {
      console.error("독서 기록을 저장하지 못했습니다.", error);
      if (error.message.includes("session has expired")) {
        session = null;
        renderAccess();
      }
      setFormMessage(`기록을 저장하지 못했습니다. ${error.message}`, true);
    } finally {
      elements.save.disabled = false;
    }
  });

  elements.records.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const record = records.find((item) => item.id === button.dataset.id);
    const child = selectedChild();
    if (!record || !child || session?.childId !== child.id) return;

    if (button.dataset.action === "edit") {
      editingId = record.id;
      elements.title.value = record.title;
      elements.pageFrom.value = record.page_from;
      elements.pageTo.value = record.page_to;
      elements.formHeading.textContent = "독서 기록 수정";
      elements.save.textContent = "변경사항 저장";
      elements.cancelEdit.hidden = false;
      setFormMessage("", false);
      elements.title.focus();
      elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (button.dataset.action !== "delete" ||
        !window.confirm(`"${record.title}" 독서 기록을 삭제할까요?`)) return;
    try {
      const { error } = await client.rpc("delete_book_reading", {
        p_id: record.id,
        p_child_id: child.id,
        p_child_token: session.token,
      });
      if (error) throw error;
      await loadRecords();
      if (editingId === record.id) resetForm();
    } catch (error) {
      console.error("독서 기록을 삭제하지 못했습니다.", error);
      if (error.message.includes("session has expired")) {
        session = null;
        renderAccess();
      }
      setFormMessage(`기록을 삭제하지 못했습니다. ${error.message}`, true);
    }
  });

  renderAccess();
  initialize().catch((error) => {
    console.error("독서 기록 페이지를 불러오지 못했습니다.", error);
    elements.records.innerHTML = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
    elements.accessStatus.textContent = "독서 기록 연결을 확인해 주세요.";
  });
})();
