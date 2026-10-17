
"use strict";

/* =========================================
   TeamPilot AI — Application Logic
========================================= */

const API = {
  tasks: "/api/tasks",
  chat: "/api/chat",
};

const VALID_STATUSES = [
  "Pending",
  "In Progress",
  "Blocked",
  "Complete",
];

const REFRESH_INTERVAL = 30_000;

const elements = {
  total: document.getElementById("count-total"),
  pending: document.getElementById("count-pending"),
  progress: document.getElementById("count-progress"),
  blocked: document.getElementById("count-blocked"),
  complete: document.getElementById("count-complete"),

  navTaskCount: document.getElementById("nav-task-count"),
  statusFilter: document.getElementById("status-filter"),
  taskRows: document.getElementById("task-rows"),
  visibleTaskCount: document.getElementById("visible-task-count"),

  refreshButton: document.getElementById("refresh-button"),
  lastUpdated: document.getElementById("last-updated"),
  feedback: document.getElementById("feedback"),

  chatForm: document.getElementById("ai-chat-form"),
  chatInput: document.getElementById("ai-chat-input"),
  chatSend: document.getElementById("ai-chat-send"),
  chatMessages: document.getElementById("ai-chat-messages"),
  chatFeedback: document.getElementById("ai-chat-feedback"),
  profileSelect: document.getElementById("profile-select"),
  progressForm: document.getElementById("progress-form"),
  progressReport: document.getElementById("progress-report"),
  progressSubmit: document.getElementById("progress-submit"),
  aiAvailability: document.getElementById("ai-availability"),
  approvalCount: document.getElementById("approval-count"),
  approvalList: document.getElementById("approval-list"),
  blockerList: document.getElementById("blocker-list"),
  activityList: document.getElementById("activity-list"),
  integrationTitle: document.getElementById("integration-title"),
  integrationState: document.getElementById("integration-state"),
};

let tasks = [];
let loadingTasks = false;
let chatBusy = false;
let demoProfiles = [];
let pendingApprovals = [];
let aiAvailable = false;
let progressAttempt = null;

/* =========================================
   General Helpers
========================================= */

function getTaskId(task) {
  return task.id ?? task._id ?? task.taskId;
}

function getTaskTitle(task) {
  return task.title ?? task.name ?? task.task ?? "Untitled task";
}

function getTaskDescription(task) {
  return task.description ?? task.details ?? "";
}

function getTaskOwner(task) {
  const owner = task.owner ?? task.assignee ?? task.assignedTo;

  if (typeof owner === "string") {
    return owner;
  }

  if (owner && typeof owner === "object") {
    return owner.name ?? owner.username ?? owner.email ?? "Unassigned";
  }

  return "Unassigned";
}

function getTaskStatus(task) {
  const status = task.status ?? "Pending";

  return VALID_STATUSES.includes(status) ? status : "Pending";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type") || "";

  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      data && typeof data === "object"
        ? data.message || data.error
        : data;

    throw new Error(message || `Request failed (${response.status})`);
  }

  return data;
}

function showFeedback(message, type = "") {
  if (!elements.feedback) return;

  elements.feedback.textContent = message;
  elements.feedback.dataset.type = type;
}

function setLoadingRow(message) {
  elements.taskRows.innerHTML = `
    <tr>
      <td colspan="4" class="loading-cell">
        <span class="loading-spinner"></span>
        ${escapeHTML(message)}
      </td>
    </tr>
  `;
}

function setErrorRow(message) {
  elements.taskRows.innerHTML = `
    <tr>
      <td colspan="4" class="error-cell">
        ${escapeHTML(message)}
      </td>
    </tr>
  `;

  elements.visibleTaskCount.textContent = "0";
}

/* =========================================
   Dashboard Summary
========================================= */

function updateSummary() {
  const counts = {
    total: tasks.length,
    pending: 0,
    progress: 0,
    blocked: 0,
    complete: 0,
  };

  for (const task of tasks) {
    switch (getTaskStatus(task)) {
      case "Pending":
        counts.pending++;
        break;

      case "In Progress":
        counts.progress++;
        break;

      case "Blocked":
        counts.blocked++;
        break;

      case "Complete":
        counts.complete++;
        break;
    }
  }

  elements.total.textContent = counts.total;
  elements.pending.textContent = counts.pending;
  elements.progress.textContent = counts.progress;
  elements.blocked.textContent = counts.blocked;
  elements.complete.textContent = counts.complete;

  elements.navTaskCount.textContent = counts.total;
}

/* =========================================
   Task Table
========================================= */

function getInitials(name) {
  const cleaned = String(name).trim();

  if (!cleaned || cleaned === "Unassigned") {
    return "?";
  }

  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getStatusClass(status) {
  switch (status) {
    case "Pending":
      return "status-pending";

    case "In Progress":
      return "status-in-progress";

    case "Blocked":
      return "status-blocked";

    case "Complete":
      return "status-complete";

    default:
      return "status-pending";
  }
}

function renderTasks() {
  const selectedStatus = elements.statusFilter.value;

  const filteredTasks =
    selectedStatus === "All"
      ? tasks
      : tasks.filter(
          (task) => getTaskStatus(task) === selectedStatus
        );

  elements.visibleTaskCount.textContent = filteredTasks.length;

  if (filteredTasks.length === 0) {
    elements.taskRows.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">
          No tasks found for this filter.
        </td>
      </tr>
    `;

    return;
  }

  elements.taskRows.innerHTML = filteredTasks
    .map((task) => {
      const id = getTaskId(task);
      const title = getTaskTitle(task);
      const description = getTaskDescription(task);
      const owner = getTaskOwner(task);
      const status = getTaskStatus(task);

      const statusOptions = VALID_STATUSES.map((option) => {
        const selected = option === status ? "selected" : "";

        return `
          <option value="${escapeHTML(option)}" ${selected}>
            ${escapeHTML(option)}
          </option>
        `;
      }).join("");

      return `
        <tr>
          <td class="task-name">
            ${escapeHTML(title)}
            ${
              description
                ? `<span class="task-description">${escapeHTML(description)}</span>`
                : ""
            }
          </td>

          <td>
            <span class="task-owner">
              <span class="owner-avatar">
                ${escapeHTML(getInitials(owner))}
              </span>
              <span>${escapeHTML(owner)}</span>
            </span>
          </td>

          <td>
            <span class="status-badge ${getStatusClass(status)}">
              ${escapeHTML(status)}
            </span>
          </td>

          <td>
            <div class="task-actions">
              <label class="sr-only" for="task-status-${escapeHTML(id)}">
                Change status for ${escapeHTML(title)}
              </label>

              <select
                id="task-status-${escapeHTML(id)}"
                class="task-action-button task-status-select"
                data-task-id="${escapeHTML(id)}"
                aria-label="Change status for ${escapeHTML(title)}"
                ${id == null ? "disabled" : ""}
              >
                ${statusOptions}
              </select>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

/* =========================================
   Load Tasks From Backend
========================================= */

async function loadTasks({ quiet = false } = {}) {
  if (loadingTasks) return;

  loadingTasks = true;

  if (elements.refreshButton) {
    elements.refreshButton.disabled = true;
  }

  if (!quiet) {
    showFeedback("");
    setLoadingRow("Loading tasks...");
  }

  try {
    const response = await requestJSON(API.tasks);

    // Support either an array or a common API response object.
    const receivedTasks = Array.isArray(response)
      ? response
      : response.tasks ?? response.data;

    if (!Array.isArray(receivedTasks)) {
      throw new Error("The tasks API did not return a task array.");
    }

    tasks = receivedTasks;

    updateSummary();
    renderTasks();

    elements.lastUpdated.textContent =
      `Last updated: ${new Date().toLocaleTimeString()}`;

    showFeedback(
      quiet ? "" : "Tasks loaded successfully.",
      quiet ? "" : "success"
    );
  } catch (error) {
    console.error("Failed to load tasks:", error);

    showFeedback(
      `Could not load tasks: ${error.message}`,
      "error"
    );

    if (tasks.length === 0) {
      setErrorRow("Unable to load tasks. Check your server and try again.");
    } else {
      // Keep existing tasks visible if a background refresh fails.
      renderTasks();
    }
  } finally {
    loadingTasks = false;

    if (elements.refreshButton) {
      elements.refreshButton.disabled = false;
    }
  }
}

/* =========================================
   Update Task Status
========================================= */

async function updateTaskStatus(taskId, newStatus, selectElement) {
  if (!VALID_STATUSES.includes(newStatus)) {
    showFeedback("Invalid task status.", "error");
    return;
  }

  const task = tasks.find(
    (item) => String(getTaskId(item)) === String(taskId)
  );

  if (!task) {
    showFeedback("Task not found. Refresh the dashboard.", "error");
    return;
  }

  const previousStatus = getTaskStatus(task);

  if (previousStatus === newStatus) return;

  if (selectElement) {
    selectElement.disabled = true;
  }

  showFeedback("Updating task status...");

  try {
    await requestJSON(
      `${API.tasks}/${encodeURIComponent(taskId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      }
    );

    // Update local state after the server confirms success.
    task.status = newStatus;

    updateSummary();
    renderTasks();

    showFeedback("Task status updated.", "success");
  } catch (error) {
    console.error("Failed to update task:", error);

    if (selectElement) {
      selectElement.value = previousStatus;
    }

    showFeedback(
      `Could not update task: ${error.message}`,
      "error"
    );
  } finally {
    if (selectElement) {
      selectElement.disabled = false;
    }
  }
}

/* =========================================
   AI Chat
========================================= */

function addChatMessage(message, sender = "assistant") {
  const messageElement = document.createElement("div");

  messageElement.className =
    sender === "user"
      ? "ai-message user-message"
      : "ai-message assistant-message";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = sender === "user" ? "You" : "✦";

  const content = document.createElement("div");
  content.className = "message-content";

  const paragraph = document.createElement("p");

  // textContent prevents HTML entered in chat messages from executing.
  paragraph.textContent = message;

  content.appendChild(paragraph);
  messageElement.appendChild(avatar);
  messageElement.appendChild(content);

  elements.chatMessages.appendChild(messageElement);

  elements.chatMessages.scrollTop =
    elements.chatMessages.scrollHeight;
}

async function sendChatMessage(event) {
  event.preventDefault();

  if (chatBusy) return;

  const message = elements.chatInput.value.trim();

  if (!message) {
    elements.chatFeedback.textContent = "Enter a message first.";
    return;
  }

  chatBusy = true;
  elements.chatSend.disabled = true;
  elements.chatInput.disabled = true;
  elements.chatFeedback.textContent = "";

  addChatMessage(message, "user");

  elements.chatInput.value = "";

  try {
    const response = await requestJSON(API.chat, {
      method: "POST",
      body: JSON.stringify({ message }),
    });

    const reply =
      response.reply ??
      response.message ??
      response.response ??
      response.answer;

    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("The AI API returned an empty response.");
    }

    addChatMessage(reply, "assistant");
  } catch (error) {
    console.error("AI chat request failed:", error);

    elements.chatFeedback.textContent =
      `Project summary unavailable: ${error.message}`;

    addChatMessage(
      "I couldn't load the saved project summary. Please try again.",
      "assistant"
    );
  } finally {
    chatBusy = false;
    elements.chatSend.disabled = false;
    elements.chatInput.disabled = false;
    elements.chatInput.focus();
  }
}

/* =========================================
   Progress, Approvals, and Activity
========================================= */

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString();
}

async function loadCommandCenter() {
  try {
    const [profileData, systemData, approvalData, activityData] = await Promise.all([
      requestJSON("/api/profiles"),
      requestJSON("/api/system"),
      requestJSON("/api/approvals"),
      requestJSON("/api/activity"),
    ]);
    demoProfiles = profileData.profiles || [];
    const selectedProfile = elements.profileSelect.value;
    elements.profileSelect.innerHTML = demoProfiles.map(profile =>
      `<option value="${escapeHTML(profile.id)}">${escapeHTML(profile.name)} · ${escapeHTML(profile.role)}</option>`
    ).join("");
    if (demoProfiles.some(profile => profile.id === selectedProfile)) {
      elements.profileSelect.value = selectedProfile;
    }
    aiAvailable = Boolean(systemData.aiAvailable);
    elements.aiAvailability.textContent = aiAvailable
      ? "Gemini is configured for server-side report analysis."
      : "AI unavailable · configure GEMINI_API_KEY on the server to analyze reports.";
    elements.aiAvailability.dataset.state = aiAvailable ? "ready" : "unavailable";
    elements.integrationTitle.textContent = "Telegram updates";
    elements.integrationState.textContent = "Keyword-based fallback stays available when configured";
    pendingApprovals = Array.isArray(approvalData) ? approvalData : [];
    renderApprovals();
    renderBlockers(activityData.blockers || []);
    renderActivity(activityData.events || []);
  } catch (error) {
    elements.aiAvailability.textContent = `Could not load command center: ${error.message}`;
    elements.aiAvailability.dataset.state = "error";
    elements.approvalList.innerHTML = `<p class="error-state">Could not load approvals. <button type="button" class="quiet-button" id="retry-command-center">Retry</button></p>`;
    document.getElementById("retry-command-center")?.addEventListener("click", loadCommandCenter);
    elements.activityList.innerHTML = `<li class="error-state">Could not load the activity timeline.</li>`;
  }
}

function renderApprovals() {
  const profileId = elements.profileSelect.value;
  elements.approvalCount.textContent = String(pendingApprovals.length);
  if (!pendingApprovals.length) {
    elements.approvalList.innerHTML = '<p class="muted-state">No approvals are waiting for review.</p>';
    return;
  }
  elements.approvalList.innerHTML = pendingApprovals.map(approval => {
    const task = tasks.find(item => String(getTaskId(item)) === String(approval.taskId));
    const taskTitle = task ? getTaskTitle(task) : `Task ${approval.taskId}`;
    const field = approval.type === "ownership" ? "Owner" : "Deadline";
    const disabled = profileId !== "kabir" ? "disabled" : "";
    const input = approval.type === "deadline"
      ? `<input id="edit-${escapeHTML(approval.id)}" type="date" data-edit-value="${escapeHTML(approval.id)}" value="${escapeHTML(approval.proposedValue)}" aria-label="Edit proposed deadline">`
      : `<select id="edit-${escapeHTML(approval.id)}" data-edit-value="${escapeHTML(approval.id)}" aria-label="Edit proposed owner">${demoProfiles.map(profile => `<option value="${escapeHTML(profile.name)}" ${profile.name === approval.proposedValue ? "selected" : ""}>${escapeHTML(profile.name)}</option>`).join("")}</select>`;
    return `<article class="approval-card" data-approval-id="${escapeHTML(approval.id)}">
      <div class="approval-card-top"><span class="approval-kind">${escapeHTML(field)} change</span><span class="timeline-status pending-approval">Pending approval</span></div>
      <h4>${escapeHTML(taskTitle)}</h4>
      <dl><div><dt>Current</dt><dd>${escapeHTML(approval.currentValue || "Not set")}</dd></div><div><dt>Proposed</dt><dd>${escapeHTML(approval.proposedValue)}</dd></div></dl>
      <p>${escapeHTML(approval.explanation)}</p><p class="approval-reason">${escapeHTML(approval.reason)}</p>
      ${profileId === "kabir" ? `<div class="approval-actions"><button type="button" class="primary-button" data-decision="approve">Approve</button><button type="button" class="secondary-button" data-decision="reject">Reject</button><label class="sr-only" for="edit-${escapeHTML(approval.id)}">Edit proposed ${field.toLowerCase()}</label>${input}<button type="button" class="secondary-button" data-decision="edit">Edit &amp; approve</button></div>` : '<p class="approval-owner-note">Select the project owner profile to review this change.</p>'}
    </article>`;
  }).join("");
}

function renderBlockers(blockers) {
  if (!blockers.length) {
    elements.blockerList.innerHTML = '<p class="muted-state">No blocker analysis yet. Submit a report to request one.</p>';
    return;
  }
  elements.blockerList.innerHTML = blockers.map(item => {
    const task = tasks.find(entry => String(getTaskId(entry)) === String(item.taskId));
    return `<article class="blocker-card"><span class="timeline-status failed">Blocker</span><h4>${escapeHTML(task ? getTaskTitle(task) : `Task ${item.taskId}`)}</h4><p><strong>Blocker</strong> ${escapeHTML(item.blocker)}</p><p><strong>Impact</strong> ${escapeHTML(item.impact)}</p><strong>Recovery steps</strong><ol>${item.recoverySteps.map(step => `<li>${escapeHTML(step)}</li>`).join("")}</ol><p class="approval-owner-note">Recommendations are advisory. Proposed owner or deadline changes require approval.</p></article>`;
  }).join("");
}

function renderActivity(events) {
  if (!events.length) {
    elements.activityList.innerHTML = '<li class="muted-state">No server-reported activity yet.</li>';
    return;
  }
  elements.activityList.innerHTML = events.map(event => {
    const task = tasks.find(item => String(getTaskId(item)) === String(event.taskId));
    const profile = demoProfiles.find(item => item.id === event.profileId);
    const statusClass = String(event.status).toLowerCase().replaceAll(" ", "-");
    return `<li class="activity-item"><span class="activity-marker ${escapeHTML(statusClass)}" aria-hidden="true"></span><div class="activity-copy"><div class="activity-meta"><span class="timeline-status ${escapeHTML(statusClass)}">${escapeHTML(event.status)}</span><time datetime="${escapeHTML(event.timestamp)}">${escapeHTML(formatTime(event.timestamp))}</time></div><h4>${escapeHTML(event.title)}</h4><p>${escapeHTML(event.explanation || event.error || "Server recorded this event.")}</p><span class="activity-context">${profile ? `Reported by ${escapeHTML(profile.name)}` : "TeamPilot agent"}${task ? ` · ${escapeHTML(getTaskTitle(task))}` : ""}</span></div></li>`;
  }).join("");
}

async function submitProgress(event) {
  event.preventDefault();
  if (!aiAvailable) {
    elements.aiAvailability.textContent = "AI unavailable. Add GEMINI_API_KEY on the server, then retry.";
    return;
  }
  const button = elements.progressSubmit;
  const reportText = elements.progressReport.value.trim();
  if (!progressAttempt || progressAttempt.message !== reportText || progressAttempt.profileId !== elements.profileSelect.value) {
    progressAttempt = {
      message: reportText,
      profileId: elements.profileSelect.value,
      idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    };
  }
  button.disabled = true;
  button.textContent = "Analyzing…";
  elements.aiAvailability.textContent = "Running · Gemini is reviewing this report…";
  try {
    const response = await requestJSON("/api/progress", {
      method: "POST",
      body: JSON.stringify({
        profileId: elements.profileSelect.value,
        message: reportText,
        idempotencyKey: progressAttempt.idempotencyKey,
      }),
    });
    progressAttempt = null;
    elements.progressReport.value = "";
    elements.aiAvailability.textContent = response.explanation || "Report reviewed. See the activity timeline for details.";
    await loadTasks({ quiet: true });
    await loadCommandCenter();
  } catch (error) {
    elements.aiAvailability.textContent = `${error.message} Your saved tasks were preserved.`;
    elements.aiAvailability.dataset.state = "error";
    await loadCommandCenter();
  } finally {
    button.disabled = false;
    button.textContent = "Analyze report";
  }
}

async function decideApproval(event) {
  const button = event.target.closest("[data-decision]");
  const card = event.target.closest("[data-approval-id]");
  if (!button || !card) return;
  button.disabled = true;
  try {
    const body = { profileId: elements.profileSelect.value, decision: button.dataset.decision };
    if (body.decision === "edit") {
      body.value = card.querySelector(`[data-edit-value="${CSS.escape(card.dataset.approvalId)}"]`).value;
    }
    await requestJSON(`/api/approvals/${encodeURIComponent(card.dataset.approvalId)}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    await loadTasks({ quiet: true });
    await loadCommandCenter();
  } catch (error) {
    elements.aiAvailability.textContent = `Approval was not applied: ${error.message}`;
    elements.aiAvailability.dataset.state = "error";
    await loadCommandCenter();
  } finally {
    button.disabled = false;
  }
}

/* =========================================
   Event Listeners
========================================= */

elements.refreshButton.addEventListener("click", () => {
  loadTasks();
});

elements.statusFilter.addEventListener("change", () => {
  renderTasks();
});

elements.taskRows.addEventListener("change", async (event) => {
  const select = event.target.closest(".task-status-select");

  if (!select) return;

  const taskId = select.dataset.taskId;
  const newStatus = select.value;

  await updateTaskStatus(taskId, newStatus, select);
});

elements.chatForm.addEventListener("submit", sendChatMessage);

elements.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.chatForm.requestSubmit();
  }
});

elements.progressForm.addEventListener("submit", submitProgress);
elements.approvalList.addEventListener("click", decideApproval);
elements.profileSelect.addEventListener("change", renderApprovals);
document.getElementById("refresh-activity").addEventListener("click", loadCommandCenter);

/* =========================================
   Start Application
========================================= */

async function initializeApp() {
  await loadTasks();
  await loadCommandCenter();

  // Refresh task data every 30 seconds.
  window.setInterval(() => {
    loadTasks({ quiet: true });
    loadCommandCenter();
  }, REFRESH_INTERVAL);
}

initializeApp();
