import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'context',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'context',
  waitForConnections: true,
  connectionLimit: 8,
  charset: 'utf8mb4',
  dateStrings: true,
});

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}
