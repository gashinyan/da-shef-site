(function () {
  const SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];
  const image = (name) => `assets/products/${name}.jpg`;
  const gallery = (stem, count = 4) =>
    Array.from({ length: count }, (_, index) => image(`${stem}-${index + 1}`));

  window.DA_CHEF_CONFIG = {
    demoMode: true,
    // TODO: Replace with the real order mailbox before publishing.
    orderEmail: "orders@example.com",
    // TODO: Set to "/api/order" when server-side order delivery is connected.
    orderEndpoint: "",
    personalDataConsentVersion: "DA-CHEF-PD-2026-07-18",
    marketingConsentVersion: "DA-CHEF-MARKETING-2026-07-18",
    discountThreshold: 25,
    discountRate: 0.15,
    embroideryGiftThreshold: 10,
    rostovDeliveryThreshold: 2,
  };

  window.DA_CHEF_PRODUCTS = [
    {
      id: "edge",
      name: "EDGE",
      category: "jackets",
      categoryLabel: "Кители",
      subtitle: "Китель, как часть вкуса",
      description: "Классическая форма с современной посадкой.",
      price: 6000,
      sizes: SIZES,
      fabric: "95% хлопок, 5% эластан",
      features: ["Приталенный силуэт", "Дышащая ткань", "Свобода движения"],
      colors: [
        { id: "white", label: "Белый", hex: "#f6f5ef", images: gallery("daily-white") },
        { id: "navy", label: "Синий", hex: "#19223f", images: gallery("daily-navy"), comingSoon: true },
        { id: "black", label: "Черный", hex: "#121212", images: gallery("daily-black") },
      ],
    },
    {
      id: "daily",
      name: "DAILY",
      category: "jackets",
      categoryLabel: "Кители",
      subtitle: "Свободно. Каждый день.",
      description: "POLO форма для активной смены.",
      price: 5000,
      sizes: SIZES,
      fabric: "95% хлопок, 5% эластан",
      features: ["Приталенный силуэт", "Мягкий материал", "Эластичность"],
      colors: [
        { id: "white", label: "Белый", hex: "#f6f5ef", images: gallery("daily-white") },
        { id: "navy", label: "Синий", hex: "#19223f", images: gallery("daily-navy"), comingSoon: true },
        { id: "black", label: "Черный", hex: "#121212", images: gallery("daily-black") },
      ],
    },
    {
      id: "line",
      name: "LINE",
      category: "jackets",
      categoryLabel: "Кители",
      subtitle: "Комфорт для тех, кто на линии",
      description: "Базовая форма, которая должна быть в гардеробе.",
      price: 4000,
      sizes: SIZES,
      fabric: "95% хлопок, 5% эластан",
      features: ["Мягкий материал", "Дышащая ткань", "Свобода движения"],
      colors: [
        {
          id: "white",
          label: "Белый",
          hex: "#f6f5ef",
          images: [image("line-white-3"), image("line-white-1"), image("line-white-2"), image("line-white-4")],
        },
        { id: "navy", label: "Синий", hex: "#19223f", images: gallery("line-navy"), comingSoon: true },
        { id: "black", label: "Черный", hex: "#121212", images: gallery("line-black") },
      ],
    },
    {
      id: "apron",
      name: "ФАРТУК",
      category: "aprons",
      categoryLabel: "Фартуки",
      subtitle: "Защита рабочей формы",
      description: "Фартук из технологичной ткани для кухни.",
      price: 2000,
      sizes: SIZES,
      fabric: "50% хлопок, 50% полиэстер",
      features: ["Защита от жира", "Водоотталкивающая ткань"],
      colors: [
        { id: "white", label: "Белый", hex: "#f6f5ef", images: gallery("apron-white") },
        { id: "blue", label: "Синий", hex: "#27336e", images: gallery("apron-blue") },
        { id: "black", label: "Черный", hex: "#121212", images: gallery("apron-black") },
      ],
    },
    {
      id: "pants",
      name: "ПОВАРСКИЕ БРЮКИ",
      category: "pants",
      categoryLabel: "Брюки",
      subtitle: "Для движения на кухне",
      description: "Лаконичная рабочая модель свободной посадки.",
      price: 2500,
      sizes: SIZES,
      fabric: "50% хлопок, 50% полиэстер",
      features: ["Комфортная посадка", "Практичный черный цвет"],
      colors: [
        { id: "black", label: "Черный", hex: "#121212", images: gallery("pants-black") },
      ],
    },
    {
      id: "docker",
      name: "ДОКЕР",
      category: "caps",
      categoryLabel: "Головные уборы",
      subtitle: "Финальный штрих формы",
      description: "Рабочий головной убор с фирменной нашивкой.",
      price: 1000,
      sizes: ["Универсальный"],
      fabric: "50% хлопок, 50% полиэстер",
      features: ["Легкая посадка", "Нашивка DA CHEF"],
      colors: [
        { id: "milk", label: "Молочный", hex: "#eae6db", images: gallery("docker-milk") },
        { id: "khaki", label: "Хаки", hex: "#706952", images: gallery("docker-khaki") },
        { id: "blue", label: "Синий", hex: "#27336e", images: gallery("docker-blue") },
        { id: "black", label: "Черный", hex: "#121212", images: gallery("docker-black") },
      ],
    },
  ];

  window.DA_CHEF_TERMS = [
    {
      title: "Именная вышивка",
      text: "В подарок при заказе от 10 комплектов униформы.",
    },
    {
      title: "Скидка до 15%",
      text: "При покупке от 25 единиц. Итоговую скидку подтверждает менеджер.",
    },
    {
      title: "Доставка",
      text: "По России и миру. В Ростове-на-Дону бесплатно от 2 единиц.",
    },
  ];
})();
