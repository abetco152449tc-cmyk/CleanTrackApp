import { createApp } from './app.mjs';
const production=process.env.NODE_ENV==='production';
if(production && !process.env.MEDIA_SIGNING_SECRET) throw Error('Set MEDIA_SIGNING_SECRET in production.');
const app=createApp({ databasePath:process.env.DATABASE_PATH, production, secureCookies:production, mediaSecret:process.env.MEDIA_SIGNING_SECRET, origins:(process.env.ALLOWED_ORIGINS??'http://localhost:8081,http://127.0.0.1:8081').split(','), admin:process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD?{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,name:process.env.ADMIN_NAME??'Barangay Administrator'}:undefined });
app.server.listen(Number(process.env.PORT??8787),process.env.HOST??'0.0.0.0',()=>console.log(`CleanTrack API listening on port ${process.env.PORT??8787}`));
process.on('SIGINT',()=>void app.close().then(()=>process.exit(0)));
