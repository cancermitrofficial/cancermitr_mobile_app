
// routes/index.js
import express from "express";
import authRouter from "./auth.routes.js";
import userRouter from "./user.routes.js";
import chatRouter from "./chat.routes.js";
import reportRouter from "./report.routes.js";
import documentRouter from "./document.routes.js";
import productRouter from "./product.routes.js";

const rootRouter = express.Router();

rootRouter.use("/auth", authRouter);
rootRouter.use("/user", userRouter);
rootRouter.use("/chat", chatRouter);
rootRouter.use("/reports", reportRouter);
rootRouter.use("/documents", documentRouter);
rootRouter.use("/products", productRouter);

export default rootRouter;