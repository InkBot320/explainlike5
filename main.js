const input1 = document.getElementById('Input');
const input2 = document.getElementById('Output');
const button = document.getElementById('Submit');

async function testGroq(prompt) {
  const response = await fetch('/api/groq', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const message = errorData?.error || response.statusText || 'Request failed';
    throw new Error(message);
  }

  const data = await response.json();
  return data.output || 'No response from server.';
}

button.onclick = async function () {
  const userText = input1.value;

  try {
    const result = await testGroq(userText);
    input2.value = result;
  } catch (error) {
    input2.value = `Error: ${error.message}`;
  }
};
