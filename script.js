let rating = 1000;
const ratingEl = document.getElementById("rating");
const addBtn = document.getElementById("addGame");
const gamesDiv = document.getElementById("games");

document.getElementById("initial").addEventListener("input", e => {
    rating = parseFloat(e.target.value);
    updateRating();
});

addBtn.addEventListener("click", addGame);

function addGame()
{
    const wrapper = document.createElement("div");
    wrapper.className = "game";

    wrapper.innerHTML = `
        <input type="number" placeholder="Your Score">
        <input type="number" placeholder="Opponent Score">
        <button>Save</button>
    `;

    const [yourScore, oppScore, saveBtn] = wrapper.querySelectorAll("input, button");

    saveBtn.addEventListener("click", () => {
        const diff = parseInt(yourScore.value) - parseInt(oppScore.value);
        rating += diff * 2; // simple demo formula
        updateRating();
    });

    gamesDiv.appendChild(wrapper);
}

function updateRating()
{
    ratingEl.textContent = rating;
}
