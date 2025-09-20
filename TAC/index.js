import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(express.static("public"));
let users = {}; // временная база пользователей
// 📌 Регистрация (учет реферала)
app.post("/api/register", (req, res) => {
  const { userId, ref } = req.body;
  if (!users[userId]) {
    users[userId] = {
      balance: 0,
      stakePercent: parseFloat(process.env.BASE_STAKE),
      refs: [],
      invitedBy: ref || null,
    };
    if (ref && users[ref]) {
      users[ref].refs.push(userId);
      if (users[ref].stakePercent < parseFloat(process.env.MAX_STAKE)) {
        users[ref].stakePercent = Math.min(
          users[ref].stakePercent + parseFloat(process.env.REF_BONUS),
          parseFloat(process.env.MAX_STAKE)
        );
      }
    }
  }
  res.json({ success: true });
});

// 📌 Профиль
app.get("/api/profile", (req, res) => {
  const userId = req.query.userId;
  if (!users[userId]) return res.json({ success: false, message: "Нет пользователя" });

  const user = users[userId];
  res.json({
    success: true,
    balance: user.balance,
    stakePercent: user.stakePercent,
    refs: user.refs.length,
    maxStake: process.env.MAX_STAKE,
  });
});

// 📌 Проверка транзакции TON
app.post("/api/task", async (req, res) => {
  const { userId, wallet, amount } = req.body;
  try {
    const r = await fetch(`https://toncenter.com/api/v2/getTransactions?address=${wallet}&limit=5&api_key=${process.env.TONCENTER_API}`);
    const data = await r.json();

    const tx = data.result.find(
      t => t.in_msg?.destination === process.env.ADMIN_TON_WALLET && parseInt(t.in_msg.value) >= amount * 1e9
    );

    if (tx) {
      users[userId].balance += amount;
      return res.json({ success: true, message: "✅ Оплата подтверждена! Баланс пополнен." });
    }
    res.json({ success: false, message: "Оплата не найдена. Попробуйте позже." });
  } catch (e) {
    res.json({ success: false, message: "Ошибка проверки транзакции." });
  }
});

// 📌 Пополнение
app.post("/api/deposit", (req, res) => {
  const { userId, amount } = req.body;
  if (amount < parseFloat(process.env.MIN_DEPOSIT)) {
    return res.json({ success: false, message: `Минимальное пополнение ${process.env.MIN_DEPOSIT} TAC` });
  }
  users[userId].balance += amount;
  res.json({ success: true });
});

// 📌 Вывод
app.post("/api/withdraw", (req, res) => {
  const { userId, wallet } = req.body;
  if (!users[userId]) return res.json({ success: false, message: "Нет пользователя" });

  if (users[userId].refs.length < 3)
    return res.json({ success: false, message: "Нужно ≥ 3 рефералов для вывода." });

  if (users[userId].balance < parseFloat(process.env.MIN_WITHDRAW))
    return res.json({ success: false, message: `Минимальный вывод ${process.env.MIN_WITHDRAW} TAC` });

  users[userId].balance = 0;
  res.json({ success: true, message: `✅ Заявка на вывод создана. Кошелек: ${wallet}` });
});

app.listen(PORT, () => console.log(`🚀 TAC Staking запущен на порту ${PORT}`));
