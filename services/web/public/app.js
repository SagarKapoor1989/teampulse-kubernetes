const elements = {
  dialog: document.querySelector('#task-dialog'),
  form: document.querySelector('#task-form'),
  notice: document.querySelector('#notice'),
  template: document.querySelector('#task-template'),
};

function showNotice(message, kind = '') {
  elements.notice.textContent = message;
  elements.notice.className = `notice ${kind}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json' } : {},
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.errors?.join(', ') || `Request failed (${response.status})`);
  return data;
}

function renderTasks(tasks) {
  for (const status of ['todo', 'doing', 'done']) {
    document.querySelector(`#tasks-${status}`).replaceChildren();
    document.querySelector(`#count-${status}`).textContent = tasks.filter((task) => task.status === status).length;
  }
  for (const task of tasks) {
    const card = elements.template.content.cloneNode(true);
    card.querySelector('.task-id').textContent = `#${task.id}`;
    card.querySelector('h4').textContent = task.title;
    const description = card.querySelector('.description');
    description.textContent = task.description || 'No description';
    if (!task.description) description.classList.add('muted');
    card.querySelector('.owner').textContent = task.owner || 'Unassigned';
    const select = card.querySelector('.status-select');
    select.value = task.status;
    select.addEventListener('change', async () => {
      try {
        await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
        await loadDashboard();
      } catch (error) {
        select.value = task.status;
        showNotice(error.message, 'error');
      }
    });
    card.querySelector('.delete-button').addEventListener('click', async () => {
      try {
        await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
        await loadDashboard();
      } catch (error) {
        showNotice(error.message, 'error');
      }
    });
    document.querySelector(`#tasks-${task.status}`).append(card);
  }
}

function renderInsights(insights) {
  document.querySelector('#metric-total').textContent = insights.total;
  document.querySelector('#metric-active').textContent = insights.active;
  document.querySelector('#metric-complete').textContent = insights.byStatus.done;
  document.querySelector('#metric-percent').textContent = `${insights.completionPercent}%`;
  document.querySelector('#progress-bar').style.width = `${insights.completionPercent}%`;
  document.querySelector('#updated-at').textContent = `Updated ${new Date(insights.generatedAt).toLocaleTimeString()}`;
}

async function loadDashboard() {
  showNotice('Refreshing services…');
  try {
    const [tasks, insights] = await Promise.all([request('/api/tasks'), request('/api/insights')]);
    renderTasks(tasks);
    renderInsights(insights);
    showNotice('');
  } catch (error) {
    showNotice(`Could not load the board: ${error.message}`, 'error');
  }
}

document.querySelector('#open-form').addEventListener('click', () => elements.dialog.showModal());
document.querySelector('#close-form').addEventListener('click', () => elements.dialog.close());
document.querySelector('#refresh').addEventListener('click', loadDashboard);
elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(elements.form));
  try {
    await request('/api/tasks', { method: 'POST', body: JSON.stringify(values) });
    elements.form.reset();
    elements.dialog.close();
    await loadDashboard();
  } catch (error) {
    showNotice(error.message, 'error');
  }
});

loadDashboard();
