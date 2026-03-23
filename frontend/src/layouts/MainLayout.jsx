import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  ApiOutlined,
  HistoryOutlined,
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

  return (
    <Layout style={{ height: '100vh', background: '#0f1123' }}>
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
      <Layout style={{ background: '#0f1123', overflow: 'hidden' }}>
        <Content className="main-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
