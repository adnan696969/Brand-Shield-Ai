// main.js

document.addEventListener("DOMContentLoaded", () => {
    
    // Sticky Navbar
    const navbar = document.getElementById("navbar");
    window.addEventListener("scroll", () => {
        if (window.scrollY > 50) {
            navbar.classList.add("scrolled");
        } else {
            navbar.classList.remove("scrolled");
        }
    });

    // Mobile Menu
    const menuIcon = document.getElementById("menu-icon");
    const navLinks = document.getElementById("nav-links");
    if (menuIcon && navLinks) {
        const toggleMenu = () => {
            const open = !navLinks.classList.contains("active");
            navLinks.classList.toggle("active", open);
            menuIcon.setAttribute("aria-expanded", open ? "true" : "false");

            const spans = menuIcon.querySelectorAll("span");
            if (open) {
                spans[0].style.transform = "rotate(45deg) translate(5px, 5px)";
                spans[1].style.opacity = "0";
                spans[2].style.transform = "rotate(-45deg) translate(7px, -6px)";
            } else {
                spans[0].style.transform = "none";
                spans[1].style.opacity = "1";
                spans[2].style.transform = "none";
            }
        };

        menuIcon.addEventListener("click", toggleMenu);
        menuIcon.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleMenu();
            }
        });
    }

    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll(".fade-in-up").forEach((el) => {
        observer.observe(el);
    });

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        const id = anchor.getAttribute("href");
        if (!id || id === "#") return;
        const target = document.querySelector(id);
        if (!target) return;
        anchor.addEventListener("click", () => {
            closeMobileNav();
        });
    });
});

function closeMobileNav() {
    const navLinks = document.getElementById("nav-links");
    const menuIcon = document.getElementById("menu-icon");
    if (navLinks) navLinks.classList.remove("active");
    if (menuIcon) {
        menuIcon.setAttribute("aria-expanded", "false");
        const spans = menuIcon.querySelectorAll("span");
        spans[0].style.transform = "none";
        spans[1].style.opacity = "1";
        spans[2].style.transform = "none";
    }
}

function initTestimonialsCarousel() {
    const track = document.getElementById("carousel-track");
    const prev = document.getElementById("carousel-prev");
    const next = document.getElementById("carousel-next");
    const dotsContainer = document.getElementById("carousel-dots");
    const root = document.getElementById("testimonial-carousel");
    if (!track || !dotsContainer || !root) return;

    const slides = track.querySelectorAll(".carousel-slide");
    const n = slides.length;
    if (n === 0) return;

    let index = 0;
    let timer = null;

    function updateDots() {
        dotsContainer.querySelectorAll(".carousel-dot").forEach((d, j) => {
            d.classList.toggle("active", j === index);
        });
    }

    function goTo(i) {
        index = ((i % n) + n) % n;
        track.style.transform = `translateX(-${index * 100}%)`;
        updateDots();
    }

    dotsContainer.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "carousel-dot" + (i === 0 ? " active" : "");
        dot.setAttribute("aria-label", `Go to testimonial ${i + 1}`);
        const j = i;
        dot.addEventListener("click", () => goTo(j));
        dotsContainer.appendChild(dot);
    }

    prev?.addEventListener("click", () => goTo(index - 1));
    next?.addEventListener("click", () => goTo(index + 1));

    function startAuto() {
        stopAuto();
        timer = window.setInterval(() => goTo(index + 1), 6500);
    }

    function stopAuto() {
        if (timer != null) {
            window.clearInterval(timer);
            timer = null;
        }
    }

    root.addEventListener("mouseenter", stopAuto);
    root.addEventListener("mouseleave", startAuto);

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        startAuto();
    }
}

function initFaqAccordion() {
    const root = document.getElementById("faq-list");
    if (!root) return;

    root.querySelectorAll(".faq-trigger").forEach((btn) => {
        btn.addEventListener("click", () => {
            const panelId = btn.getAttribute("aria-controls");
            const panel = panelId ? document.getElementById(panelId) : null;
            const item = btn.closest(".faq-item");
            const isOpen = btn.getAttribute("aria-expanded") === "true";

            root.querySelectorAll(".faq-trigger").forEach((b) => {
                if (b === btn) return;
                b.setAttribute("aria-expanded", "false");
                const pid = b.getAttribute("aria-controls");
                const p = pid ? document.getElementById(pid) : null;
                if (p) p.hidden = true;
                b.closest(".faq-item")?.classList.remove("is-open");
            });

            if (isOpen) {
                btn.setAttribute("aria-expanded", "false");
                if (panel) panel.hidden = true;
                item?.classList.remove("is-open");
            } else {
                btn.setAttribute("aria-expanded", "true");
                if (panel) panel.hidden = false;
                item?.classList.add("is-open");
            }
        });
    });
}

function initContactForm() {
    const form = document.getElementById("contact-form");
    const status = document.getElementById("contact-form-status");
    if (!form || !status) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        status.textContent = "Thank you — we have received your message and will reply within two business days.";
        form.reset();
        window.setTimeout(() => {
            status.textContent = "";
        }, 8000);
    });
}

function initHomePageEnhancements() {
    initTestimonialsCarousel();
    initFaqAccordion();
    initContactForm();
}

// Animated Counters for Stats Section
function setupCounters() {
    const counters = document.querySelectorAll('.counter');
    const speed = 200; 

    // Run this when stats section is in view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if(entry.isIntersecting) {
                counters.forEach(counter => {
                    const updateCount = () => {
                        const target = +counter.getAttribute('data-target');
                        const count = +counter.innerText;
                        const inc = target / speed;

                        if (count < target) {
                            counter.innerText = Math.ceil(count + inc);
                            setTimeout(updateCount, 20);
                        } else {
                            counter.innerText = target;
                        }
                    };
                    updateCount();
                });
                observer.disconnect();
            }
        });
    });

    const statsSection = document.getElementById('stats');
    if(statsSection) {
        observer.observe(statsSection);
    }
}

// Switch between Login and Signup tabs
function switchAuthTab(tab) {
    document.getElementById("tab-login").classList.remove("active");
    document.getElementById("tab-signup").classList.remove("active");
    document.getElementById("form-login").classList.add("hidden");
    document.getElementById("form-signup").classList.add("hidden");
    
    document.getElementById(`tab-${tab}`).classList.add("active");
    document.getElementById(`form-${tab}`).classList.remove("hidden");
    
    // Clear errors
    document.getElementById("login-error").innerText = "";
    document.getElementById("signup-error").innerText = "";
}

// Check logged in state and update nav
function updateNavAuth() {
    const loggedIn =
        typeof isLoggedIn === "function" ? isLoggedIn() : false;

    const navAuth = document.getElementById("nav-auth");
    const navLogout = document.getElementById("nav-logout");
    const navDashboard = document.getElementById("nav-dashboard");

    if (loggedIn) {
        if (navAuth) navAuth.style.display = "none";
        if (navLogout) navLogout.style.display = "inline-block";
        if (navDashboard) navDashboard.style.display = "inline-block";

        if (navLogout && !navLogout.dataset.logoutBound) {
            navLogout.dataset.logoutBound = "1";
            navLogout.addEventListener("click", (e) => {
                e.preventDefault();
                logout();
            });
        }
    } else {
        if (navAuth) navAuth.style.display = "inline-block";
        if (navLogout) navLogout.style.display = "none";
        if (navDashboard) navDashboard.style.display = "none";
    }
}

function checkAuth() {
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem("brandshield_user"));
    } catch {
        user = null;
    }
    if (!user) {
        window.location.href = "auth.html";
        return null;
    }
    return user;
}

function logout() {
    localStorage.removeItem("brandshield_user");
    window.location.href = "index.html";
}
