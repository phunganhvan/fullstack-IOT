import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  ApiOutlined,
  HistoryOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import './MainLayout.scss';
import imgAvatar from '../assets/avatar.jpg';
const { Sider, Content } = Layout;


const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/profile', icon: <UserOutlined />, label: 'Profile' },
  { key: '/data-sensor', icon: <ApiOutlined />, label: 'Data Sensor' },
  { key: '/action-history', icon: <HistoryOutlined />, label: 'Action History' },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme');
    const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : 'dark';

    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('app-theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  return (
    <Layout style={{ height: '100vh', background: 'var(--app-bg)' }}>
      {/* Sidebar */}
      <Sider className="sidebar" width={200} theme="dark">
        {/* Brand header */}
        <div className="sidebar-header">
          {/* <Avatar size={40} src="/avatar.png" icon={<UserOutlined />} className="brand-avatar" /> */}
          <img
            src={imgAvatar}
            alt="Avatar"
            className="brand-avatar"
            style={{
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              objectFit: 'cover',
            }}
          />
          <div>
            <div className="brand-title">Smart Home</div>
            <div className="brand-subtitle">Welcome, Văn</div>
          </div>
          <Button
            type="text"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            aria-label="Toggle light and dark mode"
          />
        </div>

        {/* Navigation */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          className="sidebar-menu"
          onClick={({ key }) => navigate(key)}
          items={menuItems}
        />
      </Sider>

      {/* Main content */}
      <Layout style={{ background: 'var(--app-bg)', overflow: 'hidden' }}>
        <Content className="main-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
