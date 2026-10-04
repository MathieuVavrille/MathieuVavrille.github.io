
// Load the computed results
async function loadResults() {
    const response = await fetch("/assets/flip7/results.json");
    return await response.json();
}

// Select/unselect a button
function toggleButton(button) {
    if (button.classList.contains("selected")) {
	button.classList.remove("selected");
    } else {
        button.classList.add("selected");
    }
    showResults();
}

// Encode a hand into an integer to access computed_result dictionnary
function encodeHand(){
    const numberButtons = Array.from(numberContainer.querySelectorAll("button"));
    const bonusButtons = Array.from(bonusContainer.querySelectorAll("button"));
    let encoded = 0;
    let nb_numbers = 0;
    for (let i = 0; i <= 12; i++) {
	nb_numbers += ((numberButtons[i].classList.contains("selected")) ? 1 : 0)
	encoded = 2 * encoded + ((numberButtons[i].classList.contains("selected")) ? 1 : 0);
    }
    var plus = 0;
    for (let i = 0; i < 5; i++) {
	plus += (i+1) * ((bonusButtons[i].classList.contains("selected")) ? 1 : 0)
    }
    encoded = 16 * encoded + plus;
    encoded = 2 * encoded + ((bonusButtons[5].classList.contains("selected")) ? 1 : 0);
    encoded = 2 * encoded + ((bonusButtons[6].classList.contains("selected")) ? 1 : 0);
    return [encoded, nb_numbers];
}

// Show the (already computed) results
function showResults() {
    const [encodedHand, nb_numbers] = encodeHand();
    if (nb_numbers > 7) {
	document.getElementById("result").innerHTML = `<span style="color: red;">Select fewer cards</span><br><br>`;
    } else {
	const [score, expected] = computed_results[encodedHand];
	if (nb_numbers == 7) {
	    document.getElementById("result").innerHTML = `<span style="color: blue;">Flip7 !</span><br>Score: ${score}<br>`;
	} else {
	    const text =  (expected < score) ? "Stop" : "Continue";
	    const color =  (expected < score) ? "red" : "green";
	    document.getElementById("result").innerHTML = `<span style="color: ${color};">${text}</span><br>Score: ${score}<br>Expected gain: ${(expected - score).toFixed(1)}`;
	}
    }
}



const computed_results = await loadResults();

// Keep track of the buttons that have been pressed
let selectedNumbers = Array(13).fill(false);
let selectedBonuses = [0, false, false];
let score = 0;
let nb_cards_in_hand = 0;

// Create the 13 buttons
const numberContainer = document.getElementById("buttons");
const bonusContainer = document.getElementById("bonusButtons");

// Create the buttons
function createButton(img_path, img_alt) {
    const button = document.createElement("button");
    //button.textContent = i;
    button.classList.add("number-button");
    button.addEventListener("click", function () {toggleButton(button);});
    const img = document.createElement("img");
    img.src = img_path;
    img.alt = img_alt;
    button.appendChild(img);
    return button
}
for (let i = 0; i <= 12; i++) {
    numberContainer.appendChild(createButton(`/assets/flip7/${i}.png`, `${i}`));
}
for (let i = 2; i <= 10; i += 2) {
    bonusContainer.appendChild(createButton(`/assets/flip7/plus${i}.png`, `+${i}`));
}
bonusContainer.appendChild(createButton(`/assets/flip7/times2.png`, `x2`));
bonusContainer.appendChild(createButton(`/assets/flip7/second_chance.png`, `🤍`));

showResults();
