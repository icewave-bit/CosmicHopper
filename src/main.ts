import { Game } from "./game";

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app");

new Game(app);
