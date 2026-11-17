import React, { useState } from 'react';
import { DEFAULT_AVATAR, SocialPost, User } from '../types';
import { Storage } from '../utils/storage';
import { Sound } from '../utils/sound';

interface Props {
  user: User;
  onBack: () => void;
}

export const SocialFeedScreen: React.FC<Props> = ({ user, onBack }) => {
  const [posts, setPosts] = useState<SocialPost[]>(() => Storage.getPosts());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [postText, setPostText] = useState('');

  const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Пользователь';
  const userAvatar = user.avatar || DEFAULT_AVATAR;

  const handleToggleLike = (postId: string) => {
    Sound.playClick();
    const updated = Storage.toggleLikePost(postId);
    setPosts([...updated]);
  };

  const handleDeletePost = (postId: string) => {
    if (window.confirm('Вы уверены, что хотите удалить этот пост?')) {
      Sound.playClick();
      const updated = Storage.deletePost(postId);
      setPosts([...updated]);
    }
  };

  const handleOpenModal = () => {
    Sound.playClick();
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setPostText('');
  };

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postText.trim()) return;

    Sound.playSuccess();
    const newPost: SocialPost = {
      id: `post-${Date.now()}`,
      authorId: user.id || 'user-current',
      authorName: displayName,
      authorAvatar: userAvatar,
      content: postText.trim(),
      createdAt: new Date().toISOString(),
      likesCount: 0,
      isLiked: false
    };

    const updated = Storage.addPost(newPost);
    setPosts([...updated]);
    handleCloseModal();
  };

  const formatPostTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - d.getTime()) / 60000);

      if (diffMinutes < 1) return 'Только что';
      if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} ч. назад`;

      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch {
      return 'Недавно';
    }
  };

  return (
    <div className="screen social-screen">
      <div className="page-container" style={{ maxWidth: '680px', margin: '0 auto', position: 'relative', minHeight: '80vh', paddingBottom: '40px' }}>
        
        {/* Хедер страницы */}
        <div className="page-header" style={{ marginBottom: '24px' }}>
          <div className="page-title-box">
            <button
              className="back-btn"
              onClick={() => {
                Sound.playClick();
                onBack();
              }}
              title="Вернуться на главную"
            >
              ←
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>💬</span>
                <h2 style={{ fontSize: '24px', margin: 0 }}>Социальная сеть SmartFit</h2>
              </div>
              <p style={{ fontSize: '13px', color: '#737373', marginTop: '2px' }}>
                Делитесь результатами тренировок, питанием и общайтесь с сообществом
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-sm btn-accent"
              onClick={handleOpenModal}
              style={{
                borderRadius: '100px',
                padding: '8px 16px',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>✏️</span> Написать пост
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#ffffff',
                padding: '6px 14px',
                borderRadius: '100px',
                border: '1.5px solid #ebebeb',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
            >
              <span style={{ fontSize: '18px' }}>{userAvatar}</span>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{displayName}</span>
            </div>
          </div>
        </div>

        {/* Быстрое поле создания поста вверху ленты */}
        <div
          onClick={handleOpenModal}
          style={{
            background: '#ffffff',
            border: '1.5px solid #e5e5e5',
            borderRadius: '16px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
          }}
          title="Нажмите чтобы написать пост"
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: '#f5f5f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}
          >
            {userAvatar}
          </div>
          <div
            style={{
              flex: 1,
              background: '#f5f5f5',
              padding: '11px 16px',
              borderRadius: '100px',
              color: '#888',
              fontSize: '14px'
            }}
          >
            Поделитесь своими мыслями или результатами тренировки...
          </div>
          <button
            type="button"
            className="btn btn-sm btn-accent"
            style={{ borderRadius: '100px', padding: '9px 18px' }}
          >
            ✏️ Написать
          </button>
        </div>

        {/* Список постов */}
        <div className="social-posts-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: '16px', border: '1.5px dashed #e5e5e5' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>📝</span>
              <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>Пока нет постов</h3>
              <p style={{ color: '#737373', fontSize: '14px', marginBottom: '18px' }}>
                Станьте первым, кто опубликует запись в ленте SmartFit!
              </p>
              <button className="btn btn-accent" onClick={handleOpenModal}>
                Создать первый пост
              </button>
            </div>
          ) : (
            posts.map(post => {
              const isOwnPost = (post.authorId && user.id && post.authorId === user.id) || post.authorName === displayName;

              return (
                <div
                  key={post.id}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #ebebeb',
                    borderRadius: '16px',
                    padding: '20px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                    transition: 'transform 0.15s ease'
                  }}
                >
                  {/* Шапка поста */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '50%',
                          background: '#f8f8f8',
                          border: '1.5px solid #e5e5e5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '24px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                        }}
                      >
                        {post.authorAvatar || '⚡'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '15px', color: '#171717' }}>
                          {post.authorName}
                        </div>
                        <div style={{ fontSize: '12px', color: '#888' }}>
                          {formatPostTime(post.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#16a34a',
                          background: '#f0fdf4',
                          padding: '4px 10px',
                          borderRadius: '100px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        ⚡ SmartFit
                      </span>

                      {isOwnPost && (
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#a3a3a3',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = '#ef4444';
                            e.currentTarget.style.background = '#fee2e2';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = '#a3a3a3';
                            e.currentTarget.style.background = 'transparent';
                          }}
                          title="Удалить этот пост"
                        >
                          <span>🗑️</span>
                          <span style={{ fontSize: '11px', fontWeight: 700 }}>Удалить</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Текст поста */}
                  <p
                    style={{
                      fontSize: '15px',
                      lineHeight: '1.55',
                      color: '#262626',
                      margin: '0 0 16px 0',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {post.content}
                  </p>

                  {/* Подвал поста: лайки */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '12px',
                      borderTop: '1px solid #f0f0f0'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleLike(post.id)}
                      style={{
                        background: post.isLiked ? '#fee2e2' : '#f5f5f5',
                        border: post.isLiked ? '1px solid #fca5a5' : '1px solid transparent',
                        color: post.isLiked ? '#dc2626' : '#525252',
                        padding: '7px 14px',
                        borderRadius: '100px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                      title={post.isLiked ? 'Убрать отметку «Нравится»' : 'Поставить лайк'}
                    >
                      <span style={{ fontSize: '15px' }}>{post.isLiked ? '❤️' : '🤍'}</span>
                      <span>{post.likesCount}</span>
                    </button>

                    <span style={{ fontSize: '12px', color: '#a3a3a3' }}>
                      {post.likesCount > 0 ? `${post.likesCount} чел. оценили` : 'Оцените первым'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* МОДАЛЬНОЕ ОКНО СОЗДАНИЯ ПОСТА */}
        {isModalOpen && (
          <div
            className="modal-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px'
            }}
            onClick={handleCloseModal}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                padding: '24px',
                maxWidth: '520px',
                width: '100%',
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                animation: 'modalSlideUp 0.25s ease'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>✍️</span>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Новый пост в сообщество</h3>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{
                    background: '#f5f5f5',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    fontSize: '15px'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Автор */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}
                >
                  {userAvatar}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>{displayName}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>Публикация от вашего имени</div>
                </div>
              </div>

              <form onSubmit={handleCreatePost}>
                <textarea
                  value={postText}
                  onChange={e => setPostText(e.target.value)}
                  placeholder="О чем хотите рассказать? Опишите свою сегодняшнюю тренировку, успехи в питании или поделитесь мотивацией..."
                  rows={5}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1.5px solid #e5e5e5',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    marginBottom: '16px',
                    outline: 'none',
                    lineHeight: '1.5'
                  }}
                  autoFocus
                />

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleCloseModal}
                    style={{ padding: '10px 18px', fontSize: '14px' }}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="btn btn-accent"
                    disabled={!postText.trim()}
                    style={{
                      padding: '10px 22px',
                      fontSize: '14px',
                      opacity: postText.trim() ? 1 : 0.5,
                      cursor: postText.trim() ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Опубликовать пост →
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
