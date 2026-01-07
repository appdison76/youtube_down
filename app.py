from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import sqlite3
import os
import json
import yt_dlp
from youtubesearchpython import VideosSearch, Video
import threading
from datetime import datetime

app = Flask(__name__)
CORS(app)

# 데이터베이스 초기화
def init_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    
    # 찜하기 폴더 테이블
    c.execute('''CREATE TABLE IF NOT EXISTS folders
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    
    # 찜하기 영상 테이블
    c.execute('''CREATE TABLE IF NOT EXISTS favorites
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  video_id TEXT NOT NULL,
                  title TEXT NOT NULL,
                  thumbnail TEXT,
                  duration TEXT,
                  folder_id INTEGER,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (folder_id) REFERENCES folders(id))''')
    
    # 기본 폴더 생성
    c.execute("SELECT id FROM folders WHERE name = '기본 찜하기'")
    if not c.fetchone():
        c.execute("INSERT INTO folders (name) VALUES ('기본 찜하기')")
    
    conn.commit()
    conn.close()

# 다운로드 폴더 생성
os.makedirs('downloads', exist_ok=True)
os.makedirs('downloads/audio', exist_ok=True)
os.makedirs('downloads/video', exist_ok=True)
os.makedirs('downloads/subtitles', exist_ok=True)

init_db()

def get_video_id(url_or_id):
    """URL에서 video ID 추출 또는 ID 반환"""
    if 'youtube.com' in url_or_id or 'youtu.be' in url_or_id:
        if 'v=' in url_or_id:
            return url_or_id.split('v=')[1].split('&')[0]
        elif 'youtu.be/' in url_or_id:
            return url_or_id.split('youtu.be/')[1].split('?')[0]
    return url_or_id

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/search', methods=['POST'])
def search():
    try:
        data = request.json
        query = data.get('query', '')
        
        if not query:
            return jsonify({'error': '검색어를 입력해주세요'}), 400
        
        # URL인지 확인
        if 'youtube.com' in query or 'youtu.be' in query:
            video_id = get_video_id(query)
            try:
                video = Video.get(f'https://www.youtube.com/watch?v={video_id}')
                result = {
                    'id': video_id,
                    'title': video['title'],
                    'thumbnail': video['thumbnails'][0]['url'] if video['thumbnails'] else '',
                    'duration': video.get('duration', ''),
                    'channel': video.get('channel', {}).get('name', ''),
                    'views': video.get('viewCount', {}).get('text', '')
                }
                return jsonify({'results': [result]})
            except Exception as e:
                return jsonify({'error': f'영상을 찾을 수 없습니다: {str(e)}'}), 404
        
        # 일반 검색
        videos_search = VideosSearch(query, limit=20)
        results = videos_search.result()
        
        formatted_results = []
        for video in results['result']:
            formatted_results.append({
                'id': video['id'],
                'title': video['title'],
                'thumbnail': video['thumbnails'][0]['url'] if video['thumbnails'] else '',
                'duration': video.get('duration', ''),
                'channel': video.get('channel', {}).get('name', ''),
                'views': video.get('viewCount', {}).get('text', '')
            })
        
        return jsonify({'results': formatted_results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def download():
    try:
        data = request.json
        video_id = data.get('video_id')
        download_type = data.get('type', 'video')  # video, audio, subtitle
        
        if not video_id:
            return jsonify({'error': '영상 ID가 필요합니다'}), 400
        
        video_url = f'https://www.youtube.com/watch?v={video_id}'
        
        def download_task():
            try:
                if download_type == 'audio':
                    ydl_opts = {
                        'format': 'bestaudio/best',
                        'outtmpl': f'downloads/audio/%(title)s.%(ext)s',
                        'postprocessors': [{
                            'key': 'FFmpegExtractAudio',
                            'preferredcodec': 'mp3',
                            'preferredquality': '192',
                        }],
                    }
                elif download_type == 'subtitle':
                    ydl_opts = {
                        'writesubtitles': True,
                        'writeautomaticsub': True,
                        'subtitleslangs': ['ko', 'en'],
                        'skip_download': True,
                        'outtmpl': f'downloads/subtitles/%(title)s.%(ext)s',
                    }
                else:  # video
                    ydl_opts = {
                        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
                        'outtmpl': f'downloads/video/%(title)s.%(ext)s',
                    }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([video_url])
            except Exception as e:
                print(f'다운로드 오류: {str(e)}')
        
        # 백그라운드에서 다운로드
        thread = threading.Thread(target=download_task)
        thread.start()
        
        return jsonify({'message': '다운로드가 시작되었습니다'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/favorites', methods=['GET'])
def get_favorites():
    try:
        folder_id = request.args.get('folder_id', type=int)
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        if folder_id:
            c.execute('''SELECT f.id, f.video_id, f.title, f.thumbnail, f.duration, 
                        f.folder_id, f.created_at, fo.name as folder_name
                        FROM favorites f
                        LEFT JOIN folders fo ON f.folder_id = fo.id
                        WHERE f.folder_id = ? ORDER BY f.created_at DESC''', (folder_id,))
        else:
            c.execute('''SELECT f.id, f.video_id, f.title, f.thumbnail, f.duration, 
                        f.folder_id, f.created_at, fo.name as folder_name
                        FROM favorites f
                        LEFT JOIN folders fo ON f.folder_id = fo.id
                        ORDER BY f.created_at DESC''')
        
        favorites = []
        for row in c.fetchall():
            favorites.append({
                'id': row[0],
                'video_id': row[1],
                'title': row[2],
                'thumbnail': row[3],
                'duration': row[4],
                'folder_id': row[5],
                'created_at': row[6],
                'folder_name': row[7]
            })
        
        conn.close()
        return jsonify({'favorites': favorites})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/favorites', methods=['POST'])
def add_favorite():
    try:
        data = request.json
        video_id = data.get('video_id')
        title = data.get('title')
        thumbnail = data.get('thumbnail', '')
        duration = data.get('duration', '')
        folder_id = data.get('folder_id')
        
        if not video_id or not title:
            return jsonify({'error': '필수 정보가 없습니다'}), 400
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 중복 확인
        c.execute('SELECT id FROM favorites WHERE video_id = ?', (video_id,))
        if c.fetchone():
            conn.close()
            return jsonify({'error': '이미 찜한 영상입니다'}), 400
        
        # 기본 폴더 ID 가져오기
        if not folder_id:
            c.execute("SELECT id FROM folders WHERE name = '기본 찜하기'")
            folder_id = c.fetchone()[0]
        
        c.execute('''INSERT INTO favorites (video_id, title, thumbnail, duration, folder_id)
                     VALUES (?, ?, ?, ?, ?)''',
                  (video_id, title, thumbnail, duration, folder_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': '찜하기에 추가되었습니다'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/favorites/<int:favorite_id>', methods=['DELETE'])
def delete_favorite(favorite_id):
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('DELETE FROM favorites WHERE id = ?', (favorite_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': '찜하기에서 삭제되었습니다'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/folders', methods=['GET'])
def get_folders():
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('SELECT id, name, created_at FROM folders ORDER BY created_at DESC')
        
        folders = []
        for row in c.fetchall():
            # 각 폴더의 영상 개수
            c.execute('SELECT COUNT(*) FROM favorites WHERE folder_id = ?', (row[0],))
            count = c.fetchone()[0]
            
            folders.append({
                'id': row[0],
                'name': row[1],
                'created_at': row[2],
                'count': count
            })
        
        conn.close()
        return jsonify({'folders': folders})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/folders', methods=['POST'])
def create_folder():
    try:
        data = request.json
        name = data.get('name')
        
        if not name:
            return jsonify({'error': '폴더 이름이 필요합니다'}), 400
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 중복 확인
        c.execute('SELECT id FROM folders WHERE name = ?', (name,))
        if c.fetchone():
            conn.close()
            return jsonify({'error': '이미 존재하는 폴더 이름입니다'}), 400
        
        c.execute('INSERT INTO folders (name) VALUES (?)', (name,))
        conn.commit()
        folder_id = c.lastrowid
        conn.close()
        
        return jsonify({'message': '폴더가 생성되었습니다', 'folder_id': folder_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/folders/<int:folder_id>', methods=['DELETE'])
def delete_folder(folder_id):
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 기본 폴더는 삭제 불가
        c.execute("SELECT id FROM folders WHERE id = ? AND name = '기본 찜하기'", (folder_id,))
        if c.fetchone():
            conn.close()
            return jsonify({'error': '기본 폴더는 삭제할 수 없습니다'}), 400
        
        # 폴더의 영상들을 기본 폴더로 이동
        c.execute("SELECT id FROM folders WHERE name = '기본 찜하기'")
        default_folder_id = c.fetchone()[0]
        c.execute('UPDATE favorites SET folder_id = ? WHERE folder_id = ?',
                  (default_folder_id, folder_id))
        
        c.execute('DELETE FROM folders WHERE id = ?', (folder_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'message': '폴더가 삭제되었습니다'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/favorites/<int:favorite_id>/move', methods=['POST'])
def move_favorite(favorite_id):
    try:
        data = request.json
        folder_id = data.get('folder_id')
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        if not folder_id:
            # 기본 폴더로 이동
            c.execute("SELECT id FROM folders WHERE name = '기본 찜하기'")
            folder_id = c.fetchone()[0]
        
        c.execute('UPDATE favorites SET folder_id = ? WHERE id = ?',
                  (folder_id, favorite_id))
        conn.commit()
        conn.close()
        
        return jsonify({'message': '이동되었습니다'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)






