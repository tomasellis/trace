import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';

import videoRoutes from './routes/videos';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;
const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL
const FRONTEND_HOST = process.env.FRONTEND_HOST;

console.log("BACKEND CONFIG:")
console.log(`${PORT} ${EMBEDDING_SERVICE_URL}<<<<<<<<<<<<<<<<<`)

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin: [FRONTEND_HOST ?? "", "http://localhost:5173"],
    credentials: true,
}));

app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
});

app.use('/api/videos', videoRoutes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
}); 