import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, saveAdminToken } from "./api";
import "./styles.css";

interface Restaurant {
  id: string;
  name: string;
  area?: string;
  distanceMinutes?: number | undefined;
  cuisine?: string;
  priceBand?: string;
  tags: string[];
  status: "active" | "paused" | "blocked";
}

function App() {
  const [name, setName] = useState("Demo 同事");
  const [inviteCode, setInviteCode] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [dish, setDish] = useState("");
  const [reason, setReason] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [message, setMessage] = useState("");

  async function loadRestaurants() {
    setRestaurants(await api<Restaurant[]>("/api/restaurants"));
  }

  useEffect(() => {
    void loadRestaurants();
  }, []);

  async function login() {
    const session = await api<{ token: string }>("/api/session", {
      method: "POST",
      body: JSON.stringify({ inviteCode, name })
    });
    saveAdminToken(session.token);
    setMessage(`已识别为 ${name}`);
  }

  async function addRestaurant() {
    await api<Restaurant>("/api/restaurants", {
      method: "POST",
      body: JSON.stringify({
        name: restaurantName,
        tags: ["新推荐"]
      })
    });
    setRestaurantName("");
    await loadRestaurants();
  }

  async function addRecommendation() {
    await api("/api/recommendations", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: selectedRestaurantId,
        dish,
        reason,
        weatherTags: [],
        weekdayTags: [],
        moodTags: []
      })
    });
    setDish("");
    setReason("");
    setMessage("推荐已保存");
  }

  return (
    <main className="page">
      <h1>中午吃点啥 Admin</h1>
      <section>
        <h2>登录</h2>
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <input
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          placeholder="请输入团队邀请码"
        />
        <button onClick={login}>进入</button>
      </section>
      <section>
        <h2>新增饭馆</h2>
        <input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} />
        <button onClick={addRestaurant}>保存饭馆</button>
      </section>
      <section>
        <h2>新增推荐</h2>
        <select value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
          <option value="">选择饭馆</option>
          {restaurants.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>
              {restaurant.name}
            </option>
          ))}
        </select>
        <input value={dish} onChange={(event) => setDish(event.target.value)} placeholder="推荐菜" />
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="推荐理由" />
        <button onClick={addRecommendation}>保存推荐</button>
      </section>
      <section>
        <h2>饭馆列表</h2>
        {restaurants.map((restaurant) => (
          <article key={restaurant.id}>
            <strong>{restaurant.name}</strong>
            <span>{restaurant.status}</span>
          </article>
        ))}
      </section>
      {message && <p>{message}</p>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
