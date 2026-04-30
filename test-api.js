import fetch from 'node-fetch';
const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-3.1-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`;
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
});
console.log(response.status);
console.log(await response.text());
