import { createApp } from './app.mjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
const input=createInterface({input:stdin,output:stdout});
console.log('Create the first administrator. Password input is visible in this local terminal.');
const name=await input.question('Full name: ');const email=await input.question('Email: ');const password=await input.question('Password (10+ characters): ');input.close();
const app=createApp();
if(app.db.prepare("SELECT id FROM users WHERE role='Admin'").get())throw Error('An administrator already exists. Use the Users screen to create more.');
const result=app.createUser({name,email,password},'Admin');console.log('Administrator created. Store this recovery code safely:',result.recoveryCode);app.db.close();
