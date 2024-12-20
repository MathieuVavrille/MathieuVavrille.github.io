document.addEventListener("DOMContentLoaded", function () {
    const toggles = document.querySelectorAll(".cv-toggle");

    toggles.forEach((toggle) => {
        toggle.addEventListener("click", () => {
            const section = toggle.parentElement;
            const details = section.querySelector(".cv-details");
            section.classList.toggle("active");

            if (section.classList.contains("active")) {
                details.style.maxHeight = details.scrollHeight + "px";
            } else {
                details.style.maxHeight = null;
            }
        });
    });
});
