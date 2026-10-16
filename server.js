
const express = require("express");

const app = express();
app.use(express.json());

const PORT = 5000;
const token = process.env.TELEGRAM_BOT_TOKEN;

const tasks = [
  {
    id: 1,
    title: "Connect Payment API",
    owner: "Kabir",
    status: "In Progress"
  },
  {
    id: 2,
    title: "Build Login Page",
    owner: "Aisha",
    status: "Pending"
  },
  {
    id: 3,
    title: "Test API",
    owner: "Rahul",
    status: "Pending"
  }
];

// API: Check server health
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "TeamPilot AI server is running"
  });
});

// API: Get all tasks
app.get("/api/tasks", (req, res) => {
  res.json(tasks);
});

// API: Update a task status
app.patch("/api/tasks/:id", (req, res) => {
  const taskId = Number(req.params.id);
  const task = tasks.find(t => t.id === taskId);

  if (!task) {
    return res.status(404).json({
      success: false,
      message: "Task not found"
    });
  }

  const allowedStatuses = [
    "Pending",
    "In Progress",
    "Blocked",
    "Complete"
  ];

  const { status } = req.body;

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status. Use Pending, In Progress, Blocked, or Complete."
    });
  }

  task.status = status;
  return res.json(task);
});

// Send a message through Telegram
async function sendTelegramMessage(chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    }
  );

  const result = await response.json();

  if (!result.ok) {
    console.error("Telegram send error:", result.description);
  }
}

// Listen for Telegram messages
async function startTelegramPolling() {
  if (!token) {
    console.error("Telegram token is missing. Check your .env file.");
    return;
  }

  let offset = 0;
  console.log("TeamPilot AI Telegram polling started.");

  while (true) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}`
      );

      const data = await response.json();

      if (!data.ok) {
        console.error("Telegram polling failed:", data.description);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;

        const message = update.message;
        if (!message?.text) continue;

        const command = message.text.trim();
        const chatId = message.chat.id;

        if (command === "/start") {
          await sendTelegramMessage(
            chatId,
            "Welcome to TeamPilot AI! 🚀\n" +
            "I can help coordinate your group project.\n\n" +
            "Send /tasks to see the current task list."
          );

        } else if (command === "/tasks") {
          const taskList = tasks.map(task =>
            `${task.id}. ${task.title}\n` +
            `Owner: ${task.owner}\n` +
            `Status: ${task.status}`
          ).join("\n\n");

          await sendTelegramMessage(
            chatId,
            `📋 Team Tasks\n\n${taskList}`
          );

        } else {
          await sendTelegramMessage(
            chatId,
            "I don't recognize that command yet.\nTry /start or /tasks."
          );
        }
      }
    } catch (error) {
      console.error("Telegram connection error:", error.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

// Start the Express server and Telegram polling
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

startTelegramPolling();
