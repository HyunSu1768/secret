# 비밀 눈치게임

## 구성 파일
- `server.js` : 백엔드(Express + WebSocket) 서버
- `client.html` : 프론트엔드(HTML+JS) 클라이언트 (브라우저에서 바로 사용)
- `package.json` : 서버 실행용 패키지 정보

## 설치 및 실행

### 1. 서버 실행
```bash
cd /Users/buhyeonsu/Desktop/project/public/secret
npm install
npm start
```

### 2. 클라이언트 접속
- `client.html` 파일을 브라우저에서 열면 됩니다.
- 여러 브라우저/탭에서 각각 다른 팀 코드와 이름으로 참가 가능

### 3. 게임 시작 (관리자)
- 서버 실행 후, 아래 명령어로 게임 시작
```bash
curl -X POST http://localhost:4000/start
```

## 게임 규칙
1. 참가자는 팀 코드와 이름으로 입장
2. 관리자가 게임 시작
3. 각 라운드마다 1~생존팀 수 중 하나의 숫자 선택
4. 같은 숫자를 고른 팀은 모두 탈락, 남은 팀끼리 다음 라운드 반복
5. 1팀만 남으면 승리, 모두 탈락하면 무승부 