// Dữ liệu từ vựng. Mỗi mục: "english|nghĩa tiếng Việt", ngăn cách bởi ";".
// Muốn thêm từ/chủ đề: sửa RAW và TOPICS bên dưới, không cần đụng vào code game.

export const TOPICS = [
  { id: 'animals', name: 'Động vật', emoji: '🐯' },
  { id: 'food', name: 'Đồ ăn', emoji: '🍎' },
  { id: 'school', name: 'Trường học', emoji: '🎒' },
  { id: 'family', name: 'Gia đình', emoji: '👨‍👩‍👧' },
];

const RAW = {
  animals: {
    easy: 'cat|con mèo;dog|con chó;bird|con chim;fish|con cá;cow|con bò;pig|con lợn;duck|con vịt;hen|con gà mái;horse|con ngựa;rabbit|con thỏ;frog|con ếch;sheep|con cừu',
    medium: 'monkey|con khỉ;elephant|con voi;tiger|con hổ;lion|sư tử;bear|con gấu;zebra|ngựa vằn;giraffe|hươu cao cổ;turtle|con rùa;snake|con rắn;butterfly|con bướm;spider|con nhện;dolphin|cá heo',
    hard: 'kangaroo|chuột túi;crocodile|cá sấu;penguin|chim cánh cụt;octopus|bạch tuộc;squirrel|con sóc;hedgehog|con nhím;peacock|con công;camel|lạc đà;rhinoceros|tê giác;owl|cú mèo;jellyfish|con sứa;hippopotamus|hà mã',
  },
  food: {
    easy: 'apple|quả táo;banana|quả chuối;milk|sữa;egg|quả trứng;rice|cơm, gạo;bread|bánh mì;cake|bánh ngọt;water|nước;orange|quả cam;juice|nước ép;candy|kẹo;tea|trà',
    medium: 'chicken|thịt gà;noodles|mì sợi;soup|món súp;cheese|phô mai;tomato|cà chua;potato|khoai tây;carrot|cà rốt;grapes|quả nho;lemon|quả chanh;sandwich|bánh mì kẹp;ice cream|kem;strawberry|dâu tây',
    hard: 'pineapple|quả dứa;watermelon|dưa hấu;cucumber|dưa chuột;broccoli|súp lơ xanh;mushroom|nấm;pumpkin|bí ngô;vegetable|rau củ;ingredient|nguyên liệu;delicious|ngon tuyệt;breakfast|bữa sáng;coconut|quả dừa;dessert|món tráng miệng',
  },
  school: {
    easy: 'book|quyển sách;pen|bút mực;pencil|bút chì;bag|cặp sách;desk|bàn học;chair|cái ghế;teacher|giáo viên;student|học sinh;class|lớp học;board|cái bảng;ruler|thước kẻ;school|trường học',
    medium: 'eraser|cục tẩy;notebook|vở ghi chép;library|thư viện;homework|bài tập về nhà;lesson|bài học;classroom|phòng học;playground|sân chơi;scissors|cái kéo;glue|keo dán;picture|bức tranh;test|bài kiểm tra;lunch|bữa trưa',
    hard: 'dictionary|từ điển;calculator|máy tính bỏ túi;science|khoa học;mathematics|môn toán;geography|địa lý;history|lịch sử;laboratory|phòng thí nghiệm;uniform|đồng phục;competition|cuộc thi;principal|hiệu trưởng;vocabulary|từ vựng;timetable|thời khoá biểu',
  },
  family: {
    easy: 'mother|mẹ;father|bố;sister|chị, em gái;brother|anh, em trai;baby|em bé;grandma|bà;grandpa|ông;family|gia đình;uncle|chú, bác, cậu;aunt|cô, dì;son|con trai;daughter|con gái',
    medium: 'parents|bố mẹ;cousin|anh chị em họ;husband|chồng;wife|vợ;grandparents|ông bà;neighbor|hàng xóm;friend|bạn bè;twins|cặp song sinh;kitchen|nhà bếp;bedroom|phòng ngủ;garden|khu vườn;living room|phòng khách',
    hard: 'nephew|cháu trai;niece|cháu gái;relative|họ hàng;generation|thế hệ;ancestor|tổ tiên;sibling|anh chị em ruột;stepmother|mẹ kế;adopt|nhận nuôi;married|đã kết hôn;anniversary|lễ kỷ niệm;household|hộ gia đình;responsible|có trách nhiệm',
  },
};

const cache = {};

/** Trả về mọi từ của một chủ đề: [{ en, vi, level, topic }] */
export function getWords(topic) {
  if (!cache[topic]) {
    cache[topic] = Object.entries(RAW[topic]).flatMap(([level, str]) =>
      str.split(';').map((pair) => {
        const [en, vi] = pair.split('|');
        return { en, vi, level, topic };
      }),
    );
  }
  return cache[topic];
}
