(function () {
  "use strict";

  const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  const CALENDAR_CHILD_COLORS = ["#7164da", "#e57b53", "#3d9b7a", "#d45d91", "#4489c2", "#b0842d", "#8a64b6", "#5f8b45"];
  const $ = (selector) => document.querySelector(selector);
  const supabaseConfig = window.TODO_SUPABASE_CONFIG;
  const supabaseClient = window.supabase?.createClient &&
    supabaseConfig?.url &&
    supabaseConfig?.anonKey &&
    !supabaseConfig.url.includes("YOUR_") &&
    !supabaseConfig.anonKey.includes("YOUR_")
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;

  const elements = {
    childTabs: $("#child-tabs"),
    childContent: $("#child-content"),
    emptyChildren: $("#empty-children"),
    childNameHeading: $("#child-name-heading"),
    dashboardTitle: $("#dashboard-title"),
    childViewHint: $("#child-view-hint"),
    tasksTab: $("#tasks-tab"),
    readingTab: $("#reading-tab"),
    tasksPanel: $("#tasks-panel"),
    readingPanel: $("#reading-panel"),
    readingDateLabel: $("#reading-date-label"),
    readingChildName: $("#reading-child-name"),
    readingSummary: $("#reading-summary"),
    readingAccessStatus: $("#reading-access-status"),
    readingUnlockButton: $("#reading-unlock-button"),
    readingLockButton: $("#reading-lock-button"),
    readingForm: $("#reading-form"),
    readingFormHeading: $("#reading-form-heading"),
    readingTitle: $("#reading-title"),
    readingPageFrom: $("#reading-page-from"),
    readingPageTo: $("#reading-page-to"),
    readingSaveButton: $("#reading-save-button"),
    readingCancelEdit: $("#reading-cancel-edit"),
    readingFormMessage: $("#reading-form-message"),
    readingRecordCount: $("#reading-record-count"),
    readingRecords: $("#reading-records"),
    selectedDate: $("#selected-date"),
    selectedDateLabel: $("#selected-date-label"),
    taskProgress: $("#task-progress"),
    weeklyStars: $("#weekly-stars"),
    totalStars: $("#total-stars"),
    childAccess: $("#child-access"),
    childAccessStatus: $("#child-access-status"),
    childUnlockButton: $("#child-unlock-button"),
    childChangePinButton: $("#child-change-pin-button"),
    childLockButton: $("#child-lock-button"),
    taskList: $("#task-list"),
    emptyTasks: $("#empty-tasks"),
    scheduleManager: $("#schedule-manager"),
    adminSections: $("#admin-sections"),
    adminSchedulesTab: $("#admin-schedules-tab"),
    adminCalendarTab: $("#admin-calendar-tab"),
    adminStarsTab: $("#admin-stars-tab"),
    readingCalendarPanel: $("#reading-calendar-panel"),
    calendarMonthLabel: $("#calendar-month-label"),
    calendarLegend: $("#calendar-legend"),
    readingCalendar: $("#reading-calendar"),
    calendarMessage: $("#calendar-message"),
    deductionPanel: $("#star-deduction-panel"),
    deductionHistory: $("#deduction-history"),
    deductionForm: $("#star-deduction-form"),
    deductionChild: $("#deduction-child"),
    deductionBalance: $("#deduction-balance"),
    deductionStars: $("#deduction-stars"),
    deductionReason: $("#deduction-reason"),
    deductionSubmit: $("#deduction-submit"),
    deductionMessage: $("#deduction-message"),
    deductionHistory: $("#deduction-history"),
    scheduleList: $("#schedule-list"),
    scheduleCount: $("#schedule-count"),
    selectAllSchedules: $("#select-all-schedules"),
    deleteSelectedSchedulesButton: $("#delete-selected-schedules-button"),
    scheduleError: $("#schedule-error"),
    adminPinDialog: $("#admin-pin-dialog"),
    adminPinForm: $("#admin-pin-form"),
    adminEmail: $("#admin-email"),
    adminPassword: $("#admin-password"),
    adminPinError: $("#admin-pin-error"),
    changePinDialog: $("#change-pin-dialog"),
    changePinForm: $("#change-pin-form"),
    changeEmail: $("#change-email"),
    currentPin: $("#current-pin"),
    newPin: $("#new-pin"),
    confirmPin: $("#confirm-pin"),
    changePinError: $("#change-pin-error"),
    childDialog: $("#child-dialog"),
    childForm: $("#child-form"),
    childName: $("#child-name"),
    childPin: $("#child-pin"),
    childError: $("#child-error"),
    childDialogTitle: $("#child-dialog-title"),
    childUnlockDialog: $("#child-unlock-dialog"),
    childUnlockForm: $("#child-unlock-form"),
    childUnlockPin: $("#child-unlock-pin"),
    childUnlockTitle: $("#child-unlock-title"),
    childUnlockError: $("#child-unlock-error"),
    childChangePinDialog: $("#child-change-pin-dialog"),
    childChangePinForm: $("#child-change-pin-form"),
    childNewPin: $("#child-new-pin"),
    childConfirmPin: $("#child-confirm-pin"),
    childChangePinError: $("#child-change-pin-error"),
    taskDialog: $("#task-dialog"),
    taskDialogTitle: $("#task-dialog-title"),
    taskForm: $("#task-form"),
    taskTitle: $("#task-title"),
    taskStars: $("#task-stars"),
    taskError: $("#task-error"),
    weekdayOptions: $("#weekday-options"),
    monthdayOptions: $("#monthday-options"),
    monthDay: $("#month-day"),
  };

  function todayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function makeId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  let state = { children: [], tasks: [], completions: {}, starDeductions: [], deductionHistory: [] };
  let selectedChildId = null;
  let editingChildId = null;
  let editingTaskId = null;
  let currentView = "child";
  let stateVersion = 0;
  let adminAuthenticated = false;
  let childSession = null;
  let readingRecords = [];
  let readingLoadMessage = "";
  let editingReadingId = null;
  let readingRecordsRequestId = 0;
  let activeChildSection = "tasks";
  let activeAdminSection = "schedules";
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let calendarRecordsRequestId = 0;
  elements.selectedDate.value = todayString();

  function getStateSnapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  async function persistState(previousState) {
    try {
      if (!supabaseClient || !adminAuthenticated) throw new Error("관리자 로그인이 필요합니다.");
      const { data, error } = await supabaseClient
        .from("family_state")
        .update({
          children: state.children,
          tasks: state.tasks,
          version: stateVersion + 1,
        })
        .eq("id", 1)
        .eq("version", stateVersion)
        .select("version")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("다른 기기에서 일정이 변경됐습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      }
      stateVersion = data.version;
      return true;
    } catch (error) {
      state = previousState;
      console.error("가족 일정을 저장하지 못했습니다.", error);
      window.alert(`변경 사항을 저장하지 못했습니다. ${error.message}`);
      if (error.message.includes("로그인")) {
        adminAuthenticated = false;
        currentView = "child";
        renderChildren();
      } else if (!state.children.some((child) => child.id === selectedChildId)) {
        selectedChildId = state.children[0]?.id ?? null;
      }
      return false;
    }
  }

  async function loadCompletions() {
    const { data, error } = await supabaseClient
      .from("task_completions")
      .select("child_id, task_id, completion_date, earned_stars");
    if (error) throw error;
    const completions = {};
    data.forEach((row) => {
      completions[row.child_id] ??= {};
      completions[row.child_id][row.completion_date] ??= {};
      completions[row.child_id][row.completion_date][row.task_id] = Number(row.earned_stars) || 0;
    });
    state.completions = completions;
  }

  async function loadStarDeductions() {
    const { data, error } = await supabaseClient
      .rpc("get_child_star_deduction_totals");
    if (error) throw error;
    state.starDeductions = data;
    renderDeductionPanel();
  }

  async function loadDeductionHistory() {
    const { data, error } = await supabaseClient
      .from("star_deductions")
      .select("id, child_id, stars, reason, created_at, deduction_date, cancelled_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    state.deductionHistory = data;
    renderDeductionPanel();
  }

  async function initializeState() {
    if (!supabaseClient) {
      window.alert("Supabase 연결 설정이 필요합니다. supabase-config.js에 프로젝트 URL과 anon key를 입력하세요.");
      renderChildren();
      return;
    }
    try {
      const { data, error } = await supabaseClient
        .from("family_state")
        .select("children, tasks, version")
        .eq("id", 1)
        .single();
      if (error) throw error;
      state = {
        children: Array.isArray(data.children) ? data.children : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        completions: {},
        deductionHistory: [],
        starDeductions: [],
      };
      stateVersion = Number(data.version) || 0;
      await loadCompletions();
      selectedChildId = state.children[0]?.id ?? null;
      renderChildren();
      try {
        await loadStarDeductions();
      } catch (error) {
        console.error("별 차감 정보를 불러오지 못했습니다.", error);
        window.alert(`별 차감 기능을 사용할 수 없습니다. 최신 supabase/schema.sql을 실행했는지 확인해 주세요. ${error.message}`);
      }
      renderDashboard();
      await loadReadingRecords();
    } catch (error) {
      console.error("Supabase 가족 데이터를 불러오지 못했습니다.", error);
      window.alert(`가족 데이터를 불러오지 못했습니다. Supabase SQL 설정과 연결 정보를 확인해 주세요. ${error.message}`);
      renderChildren();
    }
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

  function getRepeatDescription(task) {
    if (task.repeatType === "weekly") {
      const days = Array.isArray(task.weekdays) ? task.weekdays : [];
      return `매주 ${days.slice().sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)).map((day) => WEEKDAY_NAMES[day]).join("·")}요일`;
    }
    if (task.repeatType === "monthly") return `매월 ${task.monthDay}일`;
    return "매일";
  }

  function appliesOnDate(task, dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    if (task.repeatType === "weekly") {
      return Array.isArray(task.weekdays) && task.weekdays.includes(date.getDay());
    }
    if (task.repeatType === "monthly") {
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(Number(task.monthDay), lastDay);
    }
    return true;
  }

  function getCompletions(childId, dateString) {
    return state.completions[childId]?.[dateString] ?? {};
  }

  function getTotalStars(childId) {
    let total = 0;
    for (const dates of Object.values(state.completions[childId] ?? {})) {
      for (const [taskId, earned] of Object.entries(dates)) {
        if (typeof earned === "number") {
          total += earned;
        } else if (earned) {
          const task = state.tasks.find((item) => item.id === taskId && item.childId === childId);
          total += Number(task?.stars) || 0;
        }
      }
    }
    const deducted = Number(
      state.starDeductions.find((entry) => entry.child_id === childId)?.stars,
    ) || 0;
    return Math.max(0, total - deducted);
  }

  async function lockChildSession() {
    if (!childSession) return;
    const session = childSession;
    childSession = null;
    try {
      if (!supabaseClient) throw new Error("Supabase 연결 설정이 필요합니다.");
      const { error } = await supabaseClient.rpc("lock_child_session", {
        p_child_id: session.childId,
        p_child_token: session.token,
      });
      if (error) throw error;
    } catch (error) {
      console.error("자녀 화면 잠금에 실패했습니다.", error);
      window.alert(`자녀 화면을 잠갔지만 서버 세션을 종료하지 못했습니다. ${error.message}`);
    }
  }

  function getWeeklyStars(childId, dateString) {
    const selectedDate = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return 0;
    const weekStart = new Date(selectedDate);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekStartString = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
    const weekEndString = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, "0")}-${String(weekEnd.getDate()).padStart(2, "0")}`;
    let total = 0;
    for (const [completionDate, dates] of Object.entries(state.completions[childId] ?? {})) {
      if (completionDate < weekStartString || completionDate > weekEndString) continue;
      for (const [taskId, earned] of Object.entries(dates)) {
        if (typeof earned === "number") {
          total += earned;
        } else if (earned) {
          const task = state.tasks.find((item) => item.id === taskId && item.childId === childId);
          total += Number(task?.stars) || 0;
        }
      }
    }
    return total;
  }

  function renderChildren() {
    const isAdmin = currentView === "admin";
    if (!isAdmin) state.deductionHistory = [];
    elements.childTabs.innerHTML = state.children.map((child) => `
      <button class="child-tab" type="button" role="tab" id="child-tab-${escapeHtml(child.id)}"
        aria-selected="${child.id === selectedChildId}" aria-controls="child-content" data-child-id="${escapeHtml(child.id)}">
        ${escapeHtml(child.name)}
      </button>
    `).join("");

    const hasChildren = state.children.length > 0;
    elements.emptyChildren.hidden = hasChildren;
    elements.childContent.hidden = !hasChildren;
    $("#empty-children-title").textContent = isAdmin
      ? "먼저 우리 아이를 등록해 주세요"
      : "아직 등록된 자녀가 없어요";
    $("#empty-children-copy").textContent = isAdmin
      ? "자녀를 추가하면 아이에게 맞는 할 일표를 만들 수 있어요."
      : "관리자가 자녀를 등록하면 여기서 할 일을 확인할 수 있어요.";
    $("#edit-child-button").hidden = !hasChildren || !isAdmin;
    $("#delete-child-button").hidden = !hasChildren || !isAdmin;
    $("#add-child-button").hidden = !isAdmin;
    $("#add-task-button").hidden = !isAdmin;
    $("#empty-children [data-action='add-child']").hidden = !isAdmin;
    $("#empty-tasks-title").textContent = isAdmin
      ? "아직 등록된 할 일이 없어요"
      : "오늘 예정된 할 일이 없어요";
    $("#empty-tasks-copy").textContent = isAdmin
      ? "할 일을 추가하고 아이와 함께 즐거운 습관을 시작해 보세요."
      : "다른 날짜를 확인하거나, 오늘의 할 일을 모두 마쳤는지 살펴보세요.";
    elements.dashboardTitle.textContent = isAdmin ? "우리 아이 할 일" : "자녀별 할 일";
    elements.adminSections.hidden = !isAdmin;
    elements.readingTab.hidden = isAdmin;
    if (isAdmin) activeChildSection = "tasks";
    updateChildSectionTabs();
    renderReadingAccess();
    renderReadingRecords();
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.view === currentView));
    });
    renderScheduleManager();
    renderDeductionPanel();
    updateAdminSections();
    if (!hasChildren) return;

    if (!state.children.some((child) => child.id === selectedChildId)) {
      selectedChildId = state.children[0].id;
    }
    elements.childTabs.querySelectorAll(".child-tab").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.childId === selectedChildId));
    });
    renderDashboard();
  }

  function updateChildSectionTabs() {
    const showReading = currentView !== "admin" && activeChildSection === "reading";
    elements.tasksTab.setAttribute("aria-selected", String(!showReading));
    elements.readingTab.setAttribute("aria-selected", String(showReading));
    elements.tasksPanel.hidden = showReading;
    elements.readingPanel.hidden = !showReading;
  }

  function setReadingMessage(message, isError = false) {
    elements.readingFormMessage.textContent = message;
    elements.readingFormMessage.classList.toggle("is-error", isError);
    elements.readingFormMessage.hidden = !message;
  }

  function resetReadingForm() {
    elements.readingForm.reset();
    editingReadingId = null;
    elements.readingFormHeading.textContent = "읽은 책 추가";
    elements.readingSaveButton.textContent = "기록 저장";
    elements.readingCancelEdit.hidden = true;
    setReadingMessage("");
  }

  function renderReadingAccess() {
    const child = state.children.find((item) => item.id === selectedChildId);
    const unlocked = currentView === "child" && childSession?.childId === child?.id;
    elements.readingAccessStatus.textContent = child
      ? (unlocked ? `${child.name}님 PIN으로 독서 기록을 저장할 수 있어요.` : "자녀 PIN을 입력하면 할 일과 독서 기록을 입력할 수 있어요.")
      : "먼저 자녀를 등록해 주세요.";
    elements.readingUnlockButton.hidden = !child || unlocked;
    elements.readingLockButton.hidden = !unlocked;
    elements.readingForm.querySelectorAll("input, button").forEach((control) => {
      control.disabled = !unlocked;
    });
    elements.readingCancelEdit.disabled = !unlocked;
  }

  function renderReadingRecords() {
    const totalPages = readingRecords.reduce((total, record) =>
      total + Number(record.page_to) - Number(record.page_from) + 1, 0);
    elements.readingRecordCount.textContent = `${readingRecords.length}권`;
    elements.readingSummary.textContent = `${readingRecords.length}권 · ${totalPages}페이지`;

    if (readingRecords.length === 0) {
      const emptyMessage = readingLoadMessage || "이 날짜에 기록된 책이 없어요. 첫 독서 기록을 남겨 보세요.";
      elements.readingRecords.innerHTML = `<p class="reading-empty">${escapeHtml(emptyMessage)}</p>`;
      return;
    }
    const canManage = currentView === "child" && childSession?.childId === selectedChildId;
    elements.readingRecords.innerHTML = readingRecords.map((record) => `
      <article class="reading-record">
        <span class="reading-record-icon" aria-hidden="true">📖</span>
        <div class="reading-record-copy">
          <h4>${escapeHtml(record.title)}</h4>
          <p>${Number(record.page_from)}~${Number(record.page_to)}페이지 · ${Number(record.page_to) - Number(record.page_from) + 1}페이지 읽음</p>
        </div>
        ${canManage ? `<div class="reading-record-actions">
          <button class="reading-record-action" type="button" data-reading-action="edit" data-reading-id="${escapeHtml(record.id)}">수정</button>
          <button class="reading-record-action is-delete" type="button" data-reading-action="delete" data-reading-id="${escapeHtml(record.id)}">삭제</button>
        </div>` : ""}
      </article>
    `).join("");
  }

  async function loadReadingRecords() {
    const requestId = ++readingRecordsRequestId;
    const child = state.children.find((item) => item.id === selectedChildId);
    const dateString = elements.selectedDate.value;
    readingRecords = [];
    if (!child) {
      readingLoadMessage = "먼저 자녀를 등록해 주세요.";
      renderReadingRecords();
      return;
    }
    if (!supabaseClient) {
      readingLoadMessage = "Supabase 연결 설정을 확인해 주세요.";
      renderReadingRecords();
      return;
    }
    readingLoadMessage = "기록을 불러오는 중이에요.";
    elements.readingRecords.innerHTML = '<p class="reading-empty">기록을 불러오는 중이에요.</p>';
    try {
      const { data, error } = await supabaseClient
        .from("book_reading_records")
        .select("id, child_id, reading_date, title, page_from, page_to")
        .eq("child_id", child.id)
        .eq("reading_date", dateString)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (requestId !== readingRecordsRequestId) return;
      readingRecords = data;
      readingLoadMessage = "";
      renderReadingRecords();
    } catch (error) {
      if (requestId !== readingRecordsRequestId) return;
      console.error("자녀별 독서 기록을 불러오지 못했습니다.", error);
      readingLoadMessage = error.message;
      renderReadingRecords();
    }
  }

  elements.tasksTab.addEventListener("click", () => {
    activeChildSection = "tasks";
    updateChildSectionTabs();
  });

  elements.readingTab.addEventListener("click", () => {
    activeChildSection = "reading";
    updateChildSectionTabs();
  });

  elements.readingUnlockButton.addEventListener("click", () => {
    elements.childUnlockButton.click();
  });

  elements.readingLockButton.addEventListener("click", () => {
    elements.childLockButton.click();
  });

  elements.readingCancelEdit.addEventListener("click", resetReadingForm);

  elements.readingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const child = state.children.find((item) => item.id === selectedChildId);
    if (!child || currentView !== "child" || childSession?.childId !== child.id) {
      setReadingMessage("먼저 자녀 PIN을 입력해 주세요.", true);
      return;
    }
    const pageFrom = Number(elements.readingPageFrom.value);
    const pageTo = Number(elements.readingPageTo.value);
    const title = elements.readingTitle.value.trim();
    if (!elements.selectedDate.value || !title || title.length > 200 ||
        !Number.isInteger(pageFrom) || !Number.isInteger(pageTo) ||
        pageFrom < 1 || pageTo < pageFrom || pageTo > 100000) {
      setReadingMessage("책 제목과 올바른 페이지 범위를 입력해 주세요.", true);
      return;
    }

    elements.readingSaveButton.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("save_book_reading", {
        p_id: editingReadingId,
        p_child_id: child.id,
        p_reading_date: elements.selectedDate.value,
        p_title: title,
        p_page_from: pageFrom,
        p_page_to: pageTo,
        p_child_token: childSession.token,
      });
      if (error) throw error;
      resetReadingForm();
      await loadReadingRecords();
    } catch (error) {
      console.error("독서 기록을 저장하지 못했습니다.", error);
      if (error.message.includes("session has expired")) {
        childSession = null;
        renderDashboard();
      }
      setReadingMessage(`기록을 저장하지 못했습니다. ${error.message}`, true);
    } finally {
      renderReadingAccess();
    }
  });

  elements.readingRecords.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-reading-action]");
    if (!button) return;
    const record = readingRecords.find((item) => item.id === button.dataset.readingId);
    const child = state.children.find((item) => item.id === selectedChildId);
    if (!record || !child || childSession?.childId !== child.id || currentView !== "child") return;
    if (button.dataset.readingAction === "edit") {
      editingReadingId = record.id;
      elements.readingTitle.value = record.title;
      elements.readingPageFrom.value = record.page_from;
      elements.readingPageTo.value = record.page_to;
      elements.readingFormHeading.textContent = "독서 기록 수정";
      elements.readingSaveButton.textContent = "변경사항 저장";
      elements.readingCancelEdit.hidden = false;
      setReadingMessage("");
      elements.readingTitle.focus();
      elements.readingForm.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (button.dataset.readingAction !== "delete" ||
        !window.confirm(`"${record.title}" 독서 기록을 삭제할까요?`)) return;
    try {
      const { error } = await supabaseClient.rpc("delete_book_reading", {
        p_id: record.id,
        p_child_id: child.id,
        p_child_token: childSession.token,
      });
      if (error) throw error;
      if (editingReadingId === record.id) resetReadingForm();
      await loadReadingRecords();
    } catch (error) {
      console.error("독서 기록을 삭제하지 못했습니다.", error);
      if (error.message.includes("session has expired")) {
        childSession = null;
        renderDashboard();
      }
      setReadingMessage(`기록을 삭제하지 못했습니다. ${error.message}`, true);
    } finally {
      renderReadingAccess();
    }
  });

  function createScheduleRow(task = null) {
    const childOptions = state.children.map((child) => `
      <option value="${escapeHtml(child.id)}"${child.id === task?.childId ? " selected" : ""}>${escapeHtml(child.name)}</option>
    `).join("");
    const repeatType = task?.repeatType ?? "daily";
    const weekdays = Array.isArray(task?.weekdays) ? task.weekdays : [];
    const weekdayInputs = [1, 2, 3, 4, 5, 6, 0].map((day) => `
      <label><input type="checkbox" data-weekday="${day}"${weekdays.includes(day) ? " checked" : ""} />
        <span>${WEEKDAY_NAMES[day]}</span></label>
    `).join("");
    const row = document.createElement("article");
    row.className = "schedule-row";
    row.dataset.scheduleRow = "";
    if (task) row.dataset.taskId = task.id;
    row.innerHTML = `
      <input class="schedule-select" type="checkbox" data-schedule-select aria-label="일정 선택" />
      <select class="schedule-select-child" data-field="childId" aria-label="자녀" required>${childOptions}</select>
      <input class="schedule-input" type="text" data-field="title" maxlength="60" value="${escapeHtml(task?.title ?? "")}" placeholder="할 일 이름" aria-label="할 일 이름" required />
      <select class="schedule-repeat-select" data-field="repeatType" aria-label="반복 주기">
        <option value="daily"${repeatType === "daily" ? " selected" : ""}>매일</option>
        <option value="weekly"${repeatType === "weekly" ? " selected" : ""}>요일별</option>
        <option value="monthly"${repeatType === "monthly" ? " selected" : ""}>매월</option>
      </select>
      <div class="schedule-repeat-detail">
        <div class="schedule-weekdays"${repeatType === "weekly" ? "" : " hidden"}>${weekdayInputs}</div>
        <label class="schedule-monthly"${repeatType === "monthly" ? "" : " hidden"}>
          <input class="schedule-input" type="number" data-field="monthDay" min="1" max="31" value="${Number(task?.monthDay) || 1}" aria-label="매월 반복 날짜" />
          <span>일</span>
        </label>
        <span class="schedule-repeat-summary"${repeatType === "daily" ? "" : " hidden"}>매일</span>
      </div>
      <label class="schedule-reward"><span aria-hidden="true">★</span>
        <input class="schedule-input" type="number" data-field="stars" min="1" max="99" value="${Number(task?.stars) || 1}" aria-label="완료 보상 별" />
        <span>별</span>
      </label>`;
    return row;
  }

  function renderScheduleManager() {
    const selectedIds = new Set(
      Array.from(elements.scheduleList.querySelectorAll("[data-schedule-select]:checked"))
        .map((input) => input.closest("[data-schedule-row]").dataset.taskId)
        .filter(Boolean),
    );
    const tasks = state.tasks.slice().sort((a, b) => {
      const childA = state.children.findIndex((child) => child.id === a.childId);
      const childB = state.children.findIndex((child) => child.id === b.childId);
      return childA - childB || a.title.localeCompare(b.title, "ko");
    });
    elements.scheduleCount.textContent = `${tasks.length}개 일정`;
    elements.scheduleList.replaceChildren();
    if (tasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "schedule-empty";
      empty.textContent = state.children.length
        ? "등록된 일정이 없어요. 일정 추가 버튼으로 여러 할 일을 한꺼번에 등록해 보세요."
        : "일정을 만들려면 먼저 자녀를 등록해 주세요.";
      elements.scheduleList.append(empty);
    } else {
      tasks.forEach((task) => {
        const row = createScheduleRow(task);
        if (selectedIds.has(task.id)) {
          row.querySelector("[data-schedule-select]").checked = true;
          row.classList.add("is-selected");
        }
        elements.scheduleList.append(row);
      });
    }
    elements.selectAllSchedules.checked = tasks.length > 0 && selectedIds.size === tasks.length;
    elements.selectAllSchedules.indeterminate = selectedIds.size > 0 && selectedIds.size < tasks.length;
    elements.deleteSelectedSchedulesButton.disabled = selectedIds.size === 0;
  }

  function updateAdminSections() {
    const schedulesSelected = activeAdminSection === "schedules";
    const calendarSelected = activeAdminSection === "calendar";
    elements.adminSchedulesTab.setAttribute("aria-selected", String(schedulesSelected));
    elements.adminCalendarTab.setAttribute("aria-selected", String(calendarSelected));
    elements.adminStarsTab.setAttribute("aria-selected", String(activeAdminSection === "stars"));
    elements.scheduleManager.hidden = !schedulesSelected;
    elements.readingCalendarPanel.hidden = !calendarSelected;
    elements.deductionPanel.hidden = activeAdminSection !== "stars";
  }

  function renderDeductionPanel() {
    const previousChildId = elements.deductionChild.value;
    elements.deductionChild.innerHTML = state.children.map((child) =>
      `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`
    ).join("");
    if (state.children.some((child) => child.id === previousChildId)) {
      elements.deductionChild.value = previousChildId;
    }
    const childId = elements.deductionChild.value;
    const balance = childId ? getTotalStars(childId) : 0;
    elements.deductionBalance.textContent = String(balance);
    elements.deductionStars.max = String(balance);
    elements.deductionChild.disabled = state.children.length === 0;
    elements.deductionStars.disabled = state.children.length === 0 || balance === 0;
    elements.deductionReason.disabled = state.children.length === 0 || balance === 0;
    elements.deductionSubmit.disabled = state.children.length === 0 || balance === 0;

    if (state.deductionHistory.length === 0) {
      elements.deductionHistory.innerHTML = '<p class="schedule-empty">아직 별 차감 내역이 없어요.</p>';
      return;
    }
    elements.deductionHistory.innerHTML = state.deductionHistory.map((entry) => {
      const child = state.children.find((item) => item.id === entry.child_id);
      const formatDate = (date) => new Intl.DateTimeFormat("ko-KR", {
        year: "numeric", month: "long", day: "numeric",
      }).format(date);
      const deductionDate = formatDate(new Date(`${entry.deduction_date}T12:00:00`));
      const cancelledDate = entry.cancelled_at
        ? formatDate(new Date(entry.cancelled_at))
        : null;
      return `
        <article class="deduction-history-item">
          <div>
            <strong>${escapeHtml(child?.name ?? "삭제된 자녀")} · −${Number(entry.stars)}개</strong>
            <span>차감일 ${escapeHtml(deductionDate)}${cancelledDate ? ` · 취소됨 ${escapeHtml(cancelledDate)}` : ""}</span>
          </div>
          ${entry.cancelled_at ? "" : `<button class="button button-quiet deduction-cancel-button" type="button" data-deduction-id="${escapeHtml(entry.id)}">차감 취소</button>`}
          <p>${escapeHtml(entry.reason)}</p>
        </article>`;
    }).join("");
  }

  function calendarDateString(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function renderReadingCalendar(records = []) {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const recordsByDate = {};
    records.forEach((record) => {
      recordsByDate[record.reading_date] ??= [];
      recordsByDate[record.reading_date].push(record);
    });
    const colorForChild = (childId) => {
      const index = state.children.findIndex((child) => child.id === childId);
      return CALENDAR_CHILD_COLORS[(index < 0 ? 0 : index) % CALENDAR_CHILD_COLORS.length];
    };

    elements.calendarMonthLabel.textContent = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric", month: "long",
    }).format(calendarMonth);
    elements.calendarLegend.innerHTML = state.children.map((child) => {
      const color = colorForChild(child.id);
      return `<span class="calendar-legend-item"><i style="--child-color:${color}" aria-hidden="true"></i>${escapeHtml(child.name)}</span>`;
    }).join("");
    const headings = WEEKDAY_NAMES.map((weekday) =>
      `<div class="calendar-weekday" role="columnheader">${weekday}</div>`
    ).join("");
    const blanks = Array.from({ length: firstWeekday }, () =>
      '<div class="calendar-day is-outside" role="gridcell" aria-hidden="true"></div>'
    ).join("");
    const days = Array.from({ length: lastDay }, (_, index) => {
      const day = index + 1;
      const dateString = calendarDateString(year, month, day);
      const books = (recordsByDate[dateString] ?? []).map((record) => `
        <div class="calendar-book" style="--child-color:${colorForChild(record.child_id)}" title="${escapeHtml(`[${state.children.find((child) => child.id === record.child_id)?.name ?? "삭제된 자녀"}]${record.title}`)}">
          <span>[${escapeHtml(state.children.find((child) => child.id === record.child_id)?.name ?? "삭제된 자녀")}]</span>${escapeHtml(record.title)}
        </div>`).join("");
      return `
        <div class="calendar-day" role="gridcell" aria-label="${escapeHtml(dateString)}">
          <span class="calendar-day-number">${day}</span>
          <div class="calendar-books">${books || '<span class="calendar-no-books">-</span>'}</div>
        </div>`;
    }).join("");
    elements.readingCalendar.innerHTML = `${headings}${blanks}${days}`;
  }

  async function loadReadingCalendar() {
    const requestId = ++calendarRecordsRequestId;
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const startDate = calendarDateString(year, month, 1);
    const nextMonth = new Date(year, month + 1, 1);
    const endDate = calendarDateString(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
    elements.calendarMessage.hidden = true;
    renderReadingCalendar();
    if (!supabaseClient) {
      elements.calendarMessage.textContent = "Supabase 연결 설정을 확인해 주세요.";
      elements.calendarMessage.hidden = false;
      return;
    }
    try {
      const { data, error } = await supabaseClient
        .from("book_reading_records")
        .select("child_id, reading_date, title")
        .gte("reading_date", startDate)
        .lt("reading_date", endDate)
        .order("reading_date", { ascending: true });
      if (error) throw error;
      if (requestId !== calendarRecordsRequestId) return;
      renderReadingCalendar(data);
    } catch (error) {
      if (requestId !== calendarRecordsRequestId) return;
      console.error("월간 독서 기록을 불러오지 못했습니다.", error);
      elements.calendarMessage.textContent = `월간 독서 기록을 불러오지 못했습니다. ${error.message}`;
      elements.calendarMessage.hidden = false;
    }
  }

  async function selectAdminSection(section) {
    if (currentView !== "admin") return;
    activeAdminSection = section;
    updateAdminSections();
    if (section === "calendar") await loadReadingCalendar();
    if (section === "stars") {
      try {
        await loadDeductionHistory();
      } catch (error) {
        console.error("별 차감 내역을 불러오지 못했습니다.", error);
        elements.deductionMessage.textContent = `차감 내역을 불러오지 못했습니다. ${error.message}`;
        elements.deductionMessage.classList.add("is-error");
        elements.deductionMessage.hidden = false;
      }
    }
  }

  elements.adminSchedulesTab.addEventListener("click", () => selectAdminSection("schedules"));
  elements.adminCalendarTab.addEventListener("click", () => selectAdminSection("calendar"));
  elements.adminStarsTab.addEventListener("click", () => selectAdminSection("stars"));
  $("#previous-calendar-month").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    if (currentView === "admin" && activeAdminSection === "calendar") loadReadingCalendar();
  });
  $("#next-calendar-month").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    if (currentView === "admin" && activeAdminSection === "calendar") loadReadingCalendar();
  });
  elements.deductionChild.addEventListener("change", renderDeductionPanel);
  elements.deductionHistory.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-deduction-id]");
    if (!button || currentView !== "admin") return;
    const deduction = state.deductionHistory.find((entry) => entry.id === button.dataset.deductionId);
    if (!deduction || deduction.cancelled_at) return;
    const child = state.children.find((item) => item.id === deduction.child_id);
    const childName = child?.name ?? "삭제된 자녀";
    if (!window.confirm(`${childName}의 별 ${Number(deduction.stars)}개 차감을 취소할까요?`)) return;

    button.disabled = true;
    elements.deductionMessage.hidden = true;
    try {
      const { error } = await supabaseClient.rpc("admin_cancel_child_star_deduction", {
        p_deduction_id: deduction.id,
      });
      if (error) throw error;
      try {
        await loadStarDeductions();
        await loadDeductionHistory();
        elements.deductionMessage.textContent = `${childName}의 별 차감을 취소했습니다.`;
        elements.deductionMessage.classList.remove("is-error");
        renderDashboard();
      } catch (error) {
        console.error("취소한 별 차감 정보를 새로고침하지 못했습니다.", error);
        elements.deductionMessage.textContent = `차감 취소는 저장했지만 화면 갱신에 실패했습니다. 페이지를 새로고침해 주세요. ${error.message}`;
        elements.deductionMessage.classList.add("is-error");
      }
    } catch (error) {
      console.error("별 차감을 취소하지 못했습니다.", error);
      elements.deductionMessage.textContent = `별 차감 취소에 실패했습니다. ${error.message}`;
      elements.deductionMessage.classList.add("is-error");
    } finally {
      elements.deductionMessage.hidden = false;
      renderDeductionPanel();
    }
  });

  elements.deductionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentView !== "admin") return;
    const childId = elements.deductionChild.value;
    const stars = Number(elements.deductionStars.value);
    const reason = elements.deductionReason.value.trim();
    const balance = getTotalStars(childId);
    if (!state.children.some((child) => child.id === childId) ||
        !Number.isInteger(stars) || stars < 1 || stars > balance ||
        !reason || reason.length > 500) {
      elements.deductionMessage.textContent = "자녀, 보유 별 이내의 차감 개수, 차감 사유를 확인해 주세요.";
      elements.deductionMessage.classList.add("is-error");
      elements.deductionMessage.hidden = false;
      return;
    }
    elements.deductionSubmit.disabled = true;
    elements.deductionMessage.hidden = true;
    try {
      const { error } = await supabaseClient.rpc("admin_deduct_child_stars", {
        p_child_id: childId,
        p_stars: stars,
        p_reason: reason,
      });
      if (error) throw error;
      elements.deductionForm.reset();
      try {
        await loadStarDeductions();
        await loadDeductionHistory();
        elements.deductionMessage.textContent = `${stars}개의 별을 차감했습니다.`;
        elements.deductionMessage.classList.remove("is-error");
      } catch (error) {
        console.error("차감한 별 정보를 새로고침하지 못했습니다.", error);
        elements.deductionMessage.textContent = `차감은 저장했지만 화면 갱신에 실패했습니다. 페이지를 새로고침해 주세요. ${error.message}`;
        elements.deductionMessage.classList.add("is-error");
      }
      elements.deductionMessage.hidden = false;
      renderDashboard();
    } catch (error) {
      console.error("자녀 별을 차감하지 못했습니다.", error);
      elements.deductionMessage.textContent = `별 차감에 실패했습니다. ${error.message}`;
      elements.deductionMessage.classList.add("is-error");
      elements.deductionMessage.hidden = false;
    } finally {
      renderDeductionPanel();
    }
  });

  function updateScheduleSelection() {
    const checkboxes = Array.from(elements.scheduleList.querySelectorAll("[data-schedule-select]"));
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    checkboxes.forEach((checkbox) => checkbox.closest("[data-schedule-row]").classList.toggle("is-selected", checkbox.checked));
    elements.selectAllSchedules.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
    elements.selectAllSchedules.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
    elements.deleteSelectedSchedulesButton.disabled = selectedCount === 0;
  }

  function getScheduleDataFromRow(row) {
    const getValue = (field) => row.querySelector(`[data-field="${field}"]`)?.value;
    const repeatType = getValue("repeatType");
    const weekdays = repeatType === "weekly"
      ? Array.from(row.querySelectorAll("[data-weekday]:checked")).map((input) => Number(input.dataset.weekday))
      : [];
    return {
      id: row.dataset.taskId || makeId(),
      childId: getValue("childId"),
      title: getValue("title").trim(),
      repeatType,
      weekdays,
      monthDay: repeatType === "monthly" ? Number(getValue("monthDay")) : null,
      stars: Number(getValue("stars")),
    };
  }

  function getScheduleValidationError(entries) {
    const seenIds = new Set();
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (seenIds.has(entry.id) ||
          !state.children.some((child) => child.id === entry.childId) ||
          !entry.title ||
          !Number.isInteger(entry.stars) || entry.stars < 1 || entry.stars > 99 ||
          (entry.repeatType === "weekly" && entry.weekdays.length === 0) ||
          (entry.repeatType === "monthly" &&
            (!Number.isInteger(entry.monthDay) || entry.monthDay < 1 || entry.monthDay > 31))) {
        return index;
      }
      seenIds.add(entry.id);
    }
    return -1;
  }

  elements.scheduleList.addEventListener("change", (event) => {
    if (event.target.matches("[data-schedule-select]")) {
      updateScheduleSelection();
      return;
    }
    const row = event.target.closest("[data-schedule-row]");
    if (!row) return;
    if (event.target.matches('[data-field="repeatType"]')) {
      const type = event.target.value;
      row.querySelector(".schedule-weekdays").hidden = type !== "weekly";
      row.querySelector(".schedule-monthly").hidden = type !== "monthly";
      row.querySelector(".schedule-repeat-summary").hidden = type !== "daily";
    }
  });

  elements.childUnlockButton.addEventListener("click", () => {
    const child = state.children.find((item) => item.id === selectedChildId);
    if (!child || currentView !== "child") return;
    elements.childUnlockForm.reset();
    elements.childUnlockError.hidden = true;
    elements.childUnlockTitle.textContent = `${child.name}님 PIN 입력`;
    elements.childUnlockDialog.showModal();
    elements.childUnlockPin.focus();
  });

  elements.childUnlockForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const child = state.children.find((item) => item.id === selectedChildId);
    if (!child || currentView !== "child") return;
    try {
      if (!supabaseClient) throw new Error("Supabase 연결 설정이 필요합니다.");
      const { data, error } = await supabaseClient.rpc("verify_child_pin", {
        p_child_id: child.id,
        p_pin: elements.childUnlockPin.value,
      });
      if (error) throw error;
      if (typeof data !== "string" || !data) {
        elements.childUnlockError.textContent = "PIN이 올바르지 않거나 잠시 잠겨 있어요. 다시 확인해 주세요.";
        elements.childUnlockError.hidden = false;
        elements.childUnlockPin.focus();
        return;
      }
      if (selectedChildId !== child.id || currentView !== "child") {
        const { error: lockError } = await supabaseClient.rpc("lock_child_session", {
          p_child_id: child.id,
          p_child_token: data,
        });
        if (lockError) throw lockError;
        return;
      }
      childSession = { childId: child.id, token: data };
      elements.childUnlockDialog.close();
      renderDashboard();
    } catch (error) {
      console.error("자녀 PIN 확인에 실패했습니다.", error);
      elements.childUnlockError.textContent = `PIN을 확인하지 못했습니다. ${error.message}`;
      elements.childUnlockError.hidden = false;
    }
  });

  elements.childChangePinButton.addEventListener("click", () => {
    if (currentView !== "child" || childSession?.childId !== selectedChildId) return;
    elements.childChangePinForm.reset();
    elements.childChangePinError.hidden = true;
    elements.childChangePinDialog.showModal();
    elements.childNewPin.focus();
  });

  elements.childChangePinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentView !== "child" || childSession?.childId !== selectedChildId) return;
    const newPin = elements.childNewPin.value;
    if (!/^\d{4}$/.test(newPin)) {
      elements.childChangePinError.textContent = "새 PIN은 숫자 4자리로 입력해 주세요.";
      elements.childChangePinError.hidden = false;
      elements.childNewPin.focus();
      return;
    }
    if (newPin !== elements.childConfirmPin.value) {
      elements.childChangePinError.textContent = "새 PIN과 확인 값이 일치하지 않습니다.";
      elements.childChangePinError.hidden = false;
      elements.childConfirmPin.focus();
      return;
    }
    try {
      const { error } = await supabaseClient.rpc("change_child_pin", {
        p_child_id: childSession.childId,
        p_child_token: childSession.token,
        p_new_pin: newPin,
      });
      if (error) throw error;
      childSession = null;
      elements.childChangePinDialog.close();
      renderDashboard();
      elements.childAccessStatus.textContent = "PIN을 변경했습니다. 새 PIN으로 다시 입력해 주세요.";
    } catch (error) {
      console.error("자녀 PIN 변경에 실패했습니다.", error);
      elements.childChangePinError.textContent = `PIN을 변경하지 못했습니다. ${error.message}`;
      elements.childChangePinError.hidden = false;
    }
  });

  elements.childLockButton.addEventListener("click", async () => {
    if (!childSession || childSession.childId !== selectedChildId || currentView !== "child") return;
    await lockChildSession();
    renderDashboard();
  });

  $("#add-schedule-row-button").addEventListener("click", () => {
    elements.scheduleError.hidden = true;
    if (state.children.length === 0) {
      elements.scheduleError.textContent = "일정을 추가하려면 먼저 자녀를 등록해 주세요.";
      elements.scheduleError.hidden = false;
      return;
    }
    elements.scheduleList.querySelector(".schedule-empty")?.remove();
    elements.scheduleList.append(createScheduleRow());
    elements.scheduleCount.textContent = `${elements.scheduleList.querySelectorAll("[data-task-id]").length}개 등록 · ${elements.scheduleList.querySelectorAll("[data-schedule-row]").length - elements.scheduleList.querySelectorAll("[data-task-id]").length}개 추가 예정`;
  });

  elements.selectAllSchedules.addEventListener("change", () => {
    elements.scheduleList.querySelectorAll("[data-schedule-select]").forEach((checkbox) => {
      checkbox.checked = elements.selectAllSchedules.checked;
    });
    updateScheduleSelection();
  });

  elements.deleteSelectedSchedulesButton.addEventListener("click", async () => {
    if (currentView !== "admin") return;
    const allRows = Array.from(elements.scheduleList.querySelectorAll("[data-schedule-row]"));
    const selectedRows = allRows.filter((row) => row.querySelector("[data-schedule-select]").checked);
    if (selectedRows.length === 0) return;
    const selectedRowSet = new Set(selectedRows);
    const rowsToKeep = allRows.filter((row) => !selectedRowSet.has(row));
    const entriesToKeep = rowsToKeep.map(getScheduleDataFromRow);
    const invalidIndex = getScheduleValidationError(entriesToKeep);
    if (invalidIndex !== -1) {
      elements.scheduleError.textContent = `삭제할 항목 외의 ${invalidIndex + 1}번째 일정 정보를 확인해 주세요.`;
      elements.scheduleError.hidden = false;
      rowsToKeep[invalidIndex].scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const registeredCount = selectedRows.filter((row) => row.dataset.taskId).length;
    if (registeredCount > 0 &&
        !window.confirm(`선택한 일정 ${selectedRows.length}개를 삭제하고 나머지 변경사항을 함께 저장할까요? 기존에 적립한 별은 유지돼요.`)) return;
    const previousState = getStateSnapshot();
    state.tasks = entriesToKeep;
    if (!(await persistState(previousState))) {
      renderScheduleManager();
      return;
    }
    elements.scheduleError.hidden = true;
    renderScheduleManager();
    renderDashboard();
  });

  $("#save-schedules-button").addEventListener("click", async () => {
    if (currentView !== "admin") return;
    const rows = Array.from(elements.scheduleList.querySelectorAll("[data-schedule-row]"));
    const entries = rows.map(getScheduleDataFromRow);
    const invalidIndex = getScheduleValidationError(entries);
    if (invalidIndex !== -1) {
      elements.scheduleError.textContent = `목록의 ${invalidIndex + 1}번째 일정 정보를 확인해 주세요. 이름, 자녀, 별 수와 반복 규칙을 올바르게 입력해야 합니다.`;
      elements.scheduleError.hidden = false;
      rows[invalidIndex].scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const previousState = getStateSnapshot();
    state.tasks = entries;
    if (!(await persistState(previousState))) {
      renderScheduleManager();
      return;
    }
    elements.scheduleError.hidden = true;
    renderScheduleManager();
    renderDashboard();
    window.alert("전체 일정 목록을 저장했습니다.");
  });

  function renderDashboard() {
    const child = state.children.find((item) => item.id === selectedChildId);
    if (!child) return;

    const dateString = elements.selectedDate.value || todayString();
    const date = new Date(`${dateString}T12:00:00`);
    const formattedDate = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric", month: "long", day: "numeric", weekday: "long",
    }).format(date);
    const tasks = state.tasks.filter((task) => task.childId === child.id);
    const applicableTasks = tasks.filter((task) => appliesOnDate(task, dateString));
    const completions = getCompletions(child.id, dateString);
    const doneCount = applicableTasks.filter((task) => completions[task.id]).length;

    elements.childNameHeading.textContent = child.name;
    elements.readingChildName.textContent = child.name;
    elements.selectedDateLabel.textContent = formattedDate;
    elements.readingDateLabel.textContent = formattedDate;
    elements.taskProgress.textContent = applicableTasks.length
      ? `${applicableTasks.length}개의 할 일 중 ${doneCount}개 완료`
      : "이 날 예정된 할 일이 없어요.";
    elements.totalStars.textContent = String(getTotalStars(child.id));
    elements.weeklyStars.textContent = String(getWeeklyStars(child.id, dateString));
    const childIsAuthenticated = childSession?.childId === child.id;
    elements.childAccess.hidden = currentView !== "child";
    elements.childAccessStatus.textContent = childIsAuthenticated
      ? `${child.name}님, 할 일과 독서 기록을 입력할 수 있어요.`
      : "PIN을 입력하면 할 일과 독서 기록을 입력할 수 있어요.";
    elements.childUnlockButton.hidden = childIsAuthenticated;
    elements.childChangePinButton.hidden = !childIsAuthenticated;
    elements.childLockButton.hidden = !childIsAuthenticated;
    elements.childViewHint.hidden = currentView !== "child";
    elements.childViewHint.textContent = childIsAuthenticated
      ? "할 일을 완료하고 독서 기록을 남겨 보세요!"
      : "PIN 입력 후 할 일 완료와 독서 기록 입력이 가능해요.";
    elements.emptyTasks.hidden = tasks.length > 0;
    elements.taskList.hidden = applicableTasks.length === 0;

    elements.taskList.innerHTML = applicableTasks.map((task) => {
      const complete = Boolean(completions[task.id]);
      return `
        <article class="task-card${complete ? " is-complete" : ""}">
          <button class="task-check" type="button" aria-label="${complete ? "완료 취소" : "완료로 표시"}: ${escapeHtml(task.title)}"
            ${currentView === "child" && !childIsAuthenticated ? "disabled" : ""}
            aria-pressed="${complete}" data-action="toggle" data-task-id="${escapeHtml(task.id)}"></button>
          <div class="task-copy">
            <p class="task-title">${escapeHtml(task.title)}</p>
            <span class="task-repeat">${escapeHtml(getRepeatDescription(task))}</span>
          </div>
          <div class="task-reward" aria-label="완료하면 별 ${Number(task.stars) || 0}개"><span aria-hidden="true">★</span> +${Number(task.stars) || 0}</div>
          <div class="task-actions"${currentView === "child" ? " hidden" : ""}>
            <button class="task-action" type="button" aria-label="${escapeHtml(task.title)} 수정" title="수정" data-action="edit" data-task-id="${escapeHtml(task.id)}">✎</button>
            <button class="task-action" type="button" aria-label="${escapeHtml(task.title)} 삭제" title="삭제" data-action="delete" data-task-id="${escapeHtml(task.id)}">×</button>
          </div>
        </article>`;
    }).join("");
    renderReadingAccess();
    renderReadingRecords();
  }

  function openChildDialog(childId = null) {
    editingChildId = childId;
    const child = state.children.find((item) => item.id === childId);
    elements.childDialogTitle.textContent = child ? "자녀 이름 변경" : "자녀 추가";
    elements.childName.value = child?.name ?? "";
    elements.childPin.value = "";
    elements.childPin.required = !child;
    elements.childError.hidden = true;
    elements.childDialog.showModal();
    elements.childName.focus();
  }

  function openTaskDialog(taskId = null) {
    editingTaskId = taskId;
    const task = state.tasks.find((item) => item.id === taskId);
    elements.taskForm.reset();
    elements.taskError.hidden = true;
    elements.taskDialogTitle.textContent = task ? "할 일 수정" : "할 일 추가";
    elements.taskTitle.value = task?.title ?? "";
    elements.taskStars.value = task?.stars ?? 1;
    elements.monthDay.value = task?.monthDay ?? 1;
    const repeatType = task?.repeatType ?? "daily";
    elements.taskForm.querySelector(`input[name="repeatType"][value="${repeatType}"]`).checked = true;
    elements.taskForm.querySelectorAll('input[name="weekdays"]').forEach((input) => {
      input.checked = Array.isArray(task?.weekdays) && task.weekdays.includes(Number(input.value));
    });
    updateRepeatFields();
    elements.taskDialog.showModal();
    elements.taskTitle.focus();
  }

  function updateRepeatFields() {
    const repeatType = elements.taskForm.querySelector('input[name="repeatType"]:checked')?.value;
    elements.weekdayOptions.hidden = repeatType !== "weekly";
    elements.monthdayOptions.hidden = repeatType !== "monthly";
  }

  elements.childTabs.addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-child-id]");
    if (!tab) return;
    if (selectedChildId !== tab.dataset.childId) {
      await lockChildSession();
      resetReadingForm();
    }
    selectedChildId = tab.dataset.childId;
    renderChildren();
    await loadReadingRecords();
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.view === "admin") {
        await lockChildSession();
        renderDashboard();
        elements.adminPinForm.reset();
        elements.adminPinError.hidden = true;
        elements.adminPinDialog.showModal();
        elements.adminEmail.focus();
        return;
      }
      try {
        if (supabaseClient) {
          const { error } = await supabaseClient.auth.signOut({ scope: "local" });
          if (error) throw error;
        }
        adminAuthenticated = false;
      } catch (error) {
        console.error("관리자 세션 종료에 실패했습니다.", error);
        window.alert(error.message);
        return;
      }
      currentView = button.dataset.view;
      await lockChildSession();
      renderChildren();
      await loadReadingRecords();
    });
  });

  elements.adminPinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (!supabaseClient) throw new Error("Supabase 연결 설정이 필요합니다.");
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: elements.adminEmail.value.trim(),
        password: elements.adminPassword.value,
      });
      if (error) throw error;
      elements.adminPinDialog.close();
      adminAuthenticated = true;
      currentView = "admin";
      renderChildren();
    } catch (error) {
      console.error("관리자 로그인에 실패했습니다.", error);
      elements.adminPinError.textContent = supabaseClient
        ? "이메일 또는 비밀번호를 확인해 주세요."
        : "Supabase 연결 설정이 필요합니다. supabase-config.js를 확인해 주세요.";
      elements.adminPinError.hidden = false;
    }
  });

  $("#change-pin-button").addEventListener("click", () => {
    elements.changePinForm.reset();
    elements.changeEmail.value = elements.adminEmail.value.trim();
    elements.changePinError.hidden = true;
    elements.changePinDialog.showModal();
    elements.changeEmail.focus();
  });

  elements.changePinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (elements.newPin.value.length < 8) {
      elements.changePinError.textContent = "새 비밀번호는 8자 이상이어야 합니다.";
      elements.changePinError.hidden = false;
      elements.newPin.focus();
      return;
    }
    if (elements.newPin.value !== elements.confirmPin.value) {
      elements.changePinError.textContent = "새 비밀번호와 확인 값이 일치하지 않습니다.";
      elements.changePinError.hidden = false;
      elements.confirmPin.focus();
      return;
    }
    try {
      if (!supabaseClient) throw new Error("Supabase 연결 설정이 필요합니다.");
      const { error: loginError } = await supabaseClient.auth.signInWithPassword({
        email: elements.changeEmail.value.trim(),
        password: elements.currentPin.value,
      });
      if (loginError) throw loginError;
      const { error: updateError } = await supabaseClient.auth.updateUser({ password: elements.newPin.value });
      if (updateError) throw updateError;
      const { error: signOutError } = await supabaseClient.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      adminAuthenticated = false;
      elements.changePinDialog.close();
      elements.adminPinForm.reset();
      elements.adminEmail.value = elements.changeEmail.value.trim();
      elements.adminPinError.textContent = "비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.";
      elements.adminPinError.hidden = false;
      elements.adminPassword.focus();
    } catch (error) {
      console.error("관리자 비밀번호 변경에 실패했습니다.", error);
      elements.changePinError.textContent = error.message.includes("Invalid login credentials")
        ? "이메일 또는 현재 비밀번호를 확인해 주세요."
        : error.message || "비밀번호를 변경하지 못했습니다.";
      elements.changePinError.hidden = false;
    }
  });

  $("#add-child-button").addEventListener("click", () => {
    if (currentView === "admin") openChildDialog();
  });
  $("#edit-child-button").addEventListener("click", () => {
    if (currentView === "admin" && selectedChildId) openChildDialog(selectedChildId);
  });
  $("#delete-child-button").addEventListener("click", async () => {
    if (currentView !== "admin") return;
    const child = state.children.find((item) => item.id === selectedChildId);
    if (!child || !window.confirm(`"${child.name}"과(와) 자녀의 모든 할 일, 완료 기록, 별을 삭제할까요?`)) return;
    const previousState = getStateSnapshot();
    state.children = state.children.filter((item) => item.id !== child.id);
    state.tasks = state.tasks.filter((item) => item.childId !== child.id);
    delete state.completions[child.id];
    selectedChildId = state.children[0]?.id ?? null;
    if (!(await persistState(previousState))) {
      selectedChildId = state.children[0]?.id ?? null;
      return;
    }
    try {
      const { error } = await supabaseClient.rpc("admin_delete_child_pin", {
        p_child_id: child.id,
      });
      if (error) throw error;
    } catch (error) {
      console.error("삭제한 자녀의 PIN을 정리하지 못했습니다.", error);
      window.alert(`자녀와 할 일은 삭제했지만 PIN 정보를 정리하지 못했습니다. ${error.message}`);
    }
    renderChildren();
  });
  $("#add-task-button").addEventListener("click", () => {
    if (currentView === "admin") openTaskDialog();
  });
  $('[data-action="add-child"]').addEventListener("click", () => {
    if (currentView === "admin") openChildDialog();
  });
  async function refreshSelectedDate() {
    resetReadingForm();
    renderDashboard();
    await loadReadingRecords();
  }

  elements.selectedDate.addEventListener("change", refreshSelectedDate);

  function moveSelectedDate(offset) {
    if (!elements.selectedDate.value) return;
    const [year, month, day] = elements.selectedDate.value.split("-").map(Number);
    const date = new Date(year, month - 1, day + offset, 12);
    const nextValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    elements.selectedDate.value = nextValue;
    refreshSelectedDate();
  }

  $("#previous-day-button").addEventListener("click", () => moveSelectedDate(-1));
  $("#next-day-button").addEventListener("click", () => moveSelectedDate(1));
  $("#today-button").addEventListener("click", () => {
    elements.selectedDate.value = todayString();
    refreshSelectedDate();
  });

  elements.taskForm.addEventListener("change", (event) => {
    if (event.target.name === "repeatType") updateRepeatFields();
  });

  elements.childForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentView !== "admin") return;
    const name = elements.childName.value.trim();
    if (!name) return;
    const pin = elements.childPin.value;
    if ((!editingChildId || pin) && !/^\d{4}$/.test(pin)) {
      elements.childError.textContent = "자녀 PIN은 숫자 4자리로 입력해 주세요.";
      elements.childError.hidden = false;
      elements.childPin.focus();
      return;
    }
    const previousState = getStateSnapshot();
    let childId = editingChildId;
    if (!childId) childId = makeId();
    if (pin) {
      try {
        if (!supabaseClient) throw new Error("Supabase 연결 설정이 필요합니다.");
        const { error } = await supabaseClient.rpc("admin_set_child_pin", {
          p_child_id: childId,
          p_pin: pin,
        });
        if (error) throw error;
      } catch (error) {
        console.error("자녀 PIN을 저장하지 못했습니다.", error);
        elements.childError.textContent = `자녀 PIN을 저장하지 못했습니다. ${error.message}`;
        elements.childError.hidden = false;
        return;
      }
    }
    if (editingChildId) {
      const child = state.children.find((item) => item.id === editingChildId);
      if (child) child.name = name;
    } else {
      const child = { id: childId, name };
      state.children.push(child);
      selectedChildId = child.id;
    }
    if (!(await persistState(previousState))) return;
    elements.childDialog.close();
    renderChildren();
  });

  elements.taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentView !== "admin") return;
    const title = elements.taskTitle.value.trim();
    const repeatType = elements.taskForm.querySelector('input[name="repeatType"]:checked').value;
    const weekdays = Array.from(elements.taskForm.querySelectorAll('input[name="weekdays"]:checked'))
      .map((input) => Number(input.value));
    const stars = Number(elements.taskStars.value);
    if (!title || !Number.isInteger(stars) || stars < 1 || stars > 99) {
      elements.taskError.textContent = "할 일 이름과 1~99개의 별을 입력해 주세요.";
      elements.taskError.hidden = false;
      return;
    }
    if (repeatType === "weekly" && weekdays.length === 0) {
      elements.taskError.textContent = "반복할 요일을 하나 이상 선택해 주세요.";
      elements.taskError.hidden = false;
      return;
    }
    const taskData = {
      title,
      repeatType,
      weekdays: repeatType === "weekly" ? weekdays : [],
      monthDay: repeatType === "monthly" ? Number(elements.monthDay.value) : null,
      stars,
    };
    if (repeatType === "monthly" &&
        (!Number.isInteger(taskData.monthDay) || taskData.monthDay < 1 || taskData.monthDay > 31)) {
      elements.taskError.textContent = "매월 반복 날짜는 1일부터 31일까지 입력해 주세요.";
      elements.taskError.hidden = false;
      return;
    }

    const previousState = getStateSnapshot();
    if (editingTaskId) {
      const existing = state.tasks.find((item) => item.id === editingTaskId);
      if (existing) Object.assign(existing, taskData);
    } else {
      state.tasks.push({ id: makeId(), childId: selectedChildId, ...taskData });
    }
    if (!(await persistState(previousState))) return;
    elements.taskDialog.close();
    renderDashboard();
    renderScheduleManager();
  });

  elements.taskList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const task = state.tasks.find((item) => item.id === button.dataset.taskId);
    if (!task) return;

    if (button.dataset.action === "toggle") {
      const dateString = elements.selectedDate.value;
      if (currentView === "child") {
        try {
          if (!supabaseClient) throw new Error("Supabase 연결 설정이 필요합니다.");
          if (childSession?.childId !== task.childId) throw new Error("먼저 자녀 PIN을 입력해 주세요.");
          const { data, error } = await supabaseClient.rpc("set_task_completion", {
            p_child_id: task.childId,
            p_task_id: task.id,
            p_date: dateString,
            p_complete: !Boolean(getCompletions(task.childId, dateString)[task.id]),
            p_child_token: childSession.token,
          });
          if (error) throw error;
          state.completions[task.childId] ??= {};
          state.completions[task.childId][dateString] ??= {};
          if (data.complete) {
            state.completions[task.childId][dateString][task.id] = Number(data.stars) || 0;
          } else {
            delete state.completions[task.childId][dateString][task.id];
          }
          renderDashboard();
        } catch (error) {
          console.error("할 일 완료 상태를 저장하지 못했습니다.", error);
          if (error.message.includes("session has expired") &&
              childSession?.childId === task.childId) {
            childSession = null;
            renderDashboard();
          }
          window.alert(`완료 상태를 저장하지 못했습니다. ${error.message}`);
        }
        return;
      }
      const previousState = getStateSnapshot();
      state.completions[task.childId] ??= {};
      state.completions[task.childId][dateString] ??= {};
      const day = state.completions[task.childId][dateString];
      if (day[task.id]) {
        delete day[task.id];
        if (Object.keys(day).length === 0) delete state.completions[task.childId][dateString];
      } else {
        day[task.id] = Number(task.stars) || 0;
      }
      if (!(await persistState(previousState))) return;
      renderDashboard();
    } else if (currentView === "admin" && button.dataset.action === "edit") {
      openTaskDialog(task.id);
    } else if (currentView === "admin" && button.dataset.action === "delete") {
      if (!window.confirm(`"${task.title}" 할 일을 삭제할까요? 이미 적립한 별은 유지돼요.`)) return;
      const previousState = getStateSnapshot();
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      if (!(await persistState(previousState))) return;
      renderDashboard();
      renderScheduleManager();
    }
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  initializeState();
})();
