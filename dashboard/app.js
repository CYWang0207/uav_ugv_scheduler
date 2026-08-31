const SANDBOX_WIDTH = 640;
const SANDBOX_HEIGHT = 440;
const EVENT_LABELS = {
  TASK_PUBLISHED: "任务已发布",
  BID_SUBMITTED: "候选报价已提交",
  TASK_ASSIGNED: "协调器已分配",
  PROGRESS: "设备执行中",
  TASK_COMPLETED: "任务完成",
  SAFETY_ALERT: "安全告警"
};
const TASK_LABELS = { SURVEY: "热成像勘测", DELIVERY: "医疗物资投送" };
const VEHICLE_LABELS = { UAV: "无人机", UGV: "无人车" };

const element = (id) => document.getElementById(id);

function readableTime(milliseconds) {
  if (!milliseconds) return "--";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(milliseconds));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function humanizeCode(value) {
  return String(value ?? "").replaceAll("_", " ");
}

function taskLabel(task) {
  return TASK_LABELS[task.kind] || task.kind || "未命名任务";
}

function vehicleLabel(vehicle) {
  return VEHICLE_LABELS[vehicle.kind] || vehicle.kind || "设备";
}

function percent(value, total) {
  return Math.max(0, Math.min(100, (Number(value) / total) * 100));
}

function mapPoint(x, y) {
  return `left:${percent(x, SANDBOX_WIDTH)}%;top:${percent(y, SANDBOX_HEIGHT)}%;`;
}

function renderMap(data) {
  const tasks = data.tasks || [];
  const vehicles = data.vehicles || [];
  const items = [];
  for (const task of tasks) {
    if (!task.sandbox) continue;
    items.push(`<div class="map-item target" style="${mapPoint(task.sandbox.x, task.sandbox.y)}"><div class="map-target"></div><span class="map-label">${escapeHtml(taskLabel(task))}</span></div>`);
  }
  for (const vehicle of vehicles) {
    const assignedTask = tasks.find((task) => task.id === vehicle.task_id);
    if (!assignedTask?.sandbox) continue;
    const kindClass = vehicle.kind === "UAV" ? "uav" : "ugv";
    const label = vehicle.kind === "UAV" ? "U" : "G";
    items.push(`<div class="map-item" style="${mapPoint(assignedTask.sandbox.x, assignedTask.sandbox.y)}"><div class="map-agent ${kindClass}">${label}</div><span class="map-label">${escapeHtml(vehicle.id)}</span></div>`);
  }
  element("map-items").innerHTML = items.join("");
  const firstTask = tasks.find((task) => task.enu);
  if (firstTask?.enu) {
    element("coordinate-readout").textContent = `WGS84 -> ENU -> 沙盘像素 | ${firstTask.id}: E ${firstTask.enu.east.toFixed(2)} m, N ${firstTask.enu.north.toFixed(2)} m`;
  }
}

function renderSummary(data) {
  const vehicles = data.vehicles || [];
  element("task-count").textContent = (data.tasks || []).length;
  element("completed-count").textContent = vehicles.filter((vehicle) => vehicle.phase === "COMPLETED").length;
  element("vehicle-count").textContent = vehicles.length;
  element("domain-id").textContent = data.domain_id ?? "--";
  element("frame-badge").textContent = "CAMPUS_LOCAL / ENU";
  element("transport-label").textContent = data.transport || "ZRDDS DashboardBridge";
  element("generated-at").textContent = `快照 ${readableTime(data.generated_at_ms)}`;
}

function renderVehicles(data) {
  element("vehicle-list").innerHTML = (data.vehicles || []).map((vehicle) => {
    const kindClass = vehicle.kind === "UAV" ? "uav" : "ugv";
    const battery = Number(vehicle.battery_percent || 0);
    return `<article class="vehicle-row">
      <div class="vehicle-ident"><span class="vehicle-id">${escapeHtml(vehicle.id)}</span><span class="kind-chip ${kindClass}">${escapeHtml(vehicleLabel(vehicle))}</span></div>
      <div class="vehicle-meta"><span>${escapeHtml(vehicle.phase || "UNKNOWN")}</span><span>${battery.toFixed(1)}% 电量</span></div>
      <div class="battery-bar" aria-label="${escapeHtml(vehicle.id)} 电量 ${battery.toFixed(1)}%"><span class="battery-level" style="width:${Math.max(0, Math.min(100, battery))}%"></span></div>
      <div class="vehicle-task">${escapeHtml(vehicle.task_id || "无活动任务")}</div>
    </article>`;
  }).join("");
}

function renderTasks(data) {
  const tasks = [...(data.tasks || [])].sort((left, right) => Boolean(left.predecessor) - Boolean(right.predecessor));
  const markup = [];
  tasks.forEach((task, index) => {
    markup.push(`<article class="task-node">
      <span class="priority-chip">${escapeHtml(task.priority || "NORMAL")}</span>
      <h3>${escapeHtml(taskLabel(task))}</h3>
      <p>${escapeHtml(task.id)}</p>
      <p>执行设备: ${escapeHtml(task.assigned_to || "待分配")}</p>
    </article>`);
    if (index < tasks.length - 1) markup.push(`<div class="task-arrow" aria-label="前序任务完成后解锁"><span>完成后解锁</span></div>`);
  });
  element("task-chain").innerHTML = markup.join("");
}

function eventClass(event) {
  if (event.kind === "TASK_COMPLETED") return "completed";
  if (event.kind === "TASK_ASSIGNED") return "assigned";
  if (event.kind === "PROGRESS") return "progress";
  return "";
}

function renderEvents(data) {
  const events = [...(data.events || [])].sort((left, right) => right.occurred_at_ms - left.occurred_at_ms).slice(0, 12);
  element("event-list").innerHTML = events.map((event) => `<li class="event-item">
      <i class="event-mark ${eventClass(event)}"></i>
      <div class="event-body"><strong>${escapeHtml(EVENT_LABELS[event.kind] || event.kind)}</strong><span>${escapeHtml(event.source)} · ${escapeHtml(humanizeCode(event.code))}</span></div>
      <time class="event-time">${readableTime(event.occurred_at_ms)}</time>
    </li>`).join("");
}

function render(data) {
  renderSummary(data);
  renderMap(data);
  renderVehicles(data);
  renderTasks(data);
  renderEvents(data);
}

async function refresh() {
  const status = element("connection-status");
  try {
    const response = await fetch(`telemetry.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
    status.className = "connection is-live";
    status.lastElementChild.textContent = "DDS 遥测桥在线";
  } catch (error) {
    status.className = "connection is-error";
    status.lastElementChild.textContent = "遥测快照不可用";
  }
}

refresh();
window.setInterval(refresh, 1000);
