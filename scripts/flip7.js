

// Keep track of the buttons that have been pressed
let selectedNumbers = Array(13).fill(false);;
let score = 0;
let nb_cards_in_hand = 0;

// Create the 13 buttons
const buttonContainer = document.getElementById("buttons");

for (let i = 0; i <= 12; i++) {
    const button = document.createElement("button");
    //button.textContent = i;
    button.classList.add("number-button");
    button.addEventListener("click", function () {
        toggleNumber(i, button);
    });
    const img = document.createElement("img");
    img.src = `/assets/flip7/${i}.png`;
    img.alt = `${i}`;

    button.appendChild(img);
    buttonContainer.appendChild(button);
}

computeProduct();


// Add/remove a number from the selection
function toggleNumber(number, button) {
    if (selectedNumbers[number]) {
        // Remove the number
        selectedNumbers[number] = false;
	score -= number;
	nb_cards_in_hand -= 1;
	button.classList.remove("selected");
    } else {
        // Add the number
        selectedNumbers[number] = true;
	score += number;
	nb_cards_in_hand += 1;
        button.classList.add("selected");
    }
    computeProduct();
}

// Compute the product of all selected numbers
function computeProduct() {
    document.getElementById("result").textContent = "";
    let average = 0.;
    const total_nb_cards = 1 + 6 * 13;
    let flip7Bonus = (nb_cards_in_hand == 6) ? 15. : 0.;
    for (let i = 0; i <= 12; i++) {
	const proba = (Math.max(1, i) - (selectedNumbers[i] ? 1 : 0)) / total_nb_cards;
	const reward = selectedNumbers[i] ? -score : (i + flip7Bonus);
	average += proba * reward;
    }
    const text = average < 0 ? "Stop" : "Continue";
    const color = average < 0 ? "red" : "green";
    document.getElementById("result").innerHTML = `<span style="color: ${color};">${text}</span><br>Gain: ${average.toFixed(1)}`;
}
