import fetch from 'node-fetch';
const response = await fetch('http://127.0.0.1:3000/api/gemini/v1alpha/models/gemini-3.1-flash-preview:generateContent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
});
console.log(response.status);
console.log(await response.text());
