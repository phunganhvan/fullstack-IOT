import React from 'react';
import { Avatar } from 'antd';
import avatarImg from '../assets/MainAvatar.png';
import {
  UserOutlined, CalendarOutlined, IdcardOutlined,
  TeamOutlined, FilePdfOutlined, ApiOutlined,
  GithubOutlined, BuildOutlined,
} from '@ant-design/icons';
import './Profile.scss';

const fields = [
  { icon: <UserOutlined />, label: 'HỌ VÀ TÊN', value: 'Phùng Anh Văn' },
  { icon: <CalendarOutlined />, label: 'NGÀY THÁNG NĂM SINH', value: '13/12/2004' },
  { icon: <IdcardOutlined />, label: 'MÃ SINH VIÊN', value: 'B22DCPT302' },
  { icon: <TeamOutlined />, label: 'CPA TÍCH LŨY', value: '3.26' },
];

const links = [
  { icon: <FilePdfOutlined />, label: 'Báo cáo PDF', href: 'https://drive.google.com/file/d/1z4Vysm36BJBDvGIrFBuQBrPdYmUlkdfC/view?usp=sharing' },
  { icon: <ApiOutlined />, label: 'API Docs', href: 'https://fullstackoverflow-1444.postman.co/workspace/Backend_Nodejs~12f2ece7-204a-4989-97e6-bd2bed30f0c1/collection/43778575-b0eb717c-424c-4a35-a030-a1d54fdd6f8f?action=share&source=copy-link&creator=43778575' },
  { icon: <GithubOutlined />, label: 'GitHub', href: 'https://github.com/phunganhvan/fullstack-IOT/tree/main' },
  { icon: <BuildOutlined />, label: 'Figma / Draw.io', href: 'https://www.figma.com/proto/XthO5a3DNdAhGHSeYIuFYw/MyIOTDesign?node-id=3-135&scaling=scale-down&content-scaling=fixed' },
];

export default function Profile() {
  return (
    <div className="profile-root">
      <div className="page-header" style={{ flexShrink: 0, padding: '16px 20px 0' }}>
        <div>
          <h1 className="page-title">User Profile</h1>
          <p className="page-subtitle">Manage your personal details</p>
        </div>
        <div className="page-time">
          {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}<br />
          <span style={{ fontSize: 11 }}>{new Date().toDateString()}</span>
        </div>
      </div>

      <div className="profile-card-wrap">
        <div className="profile-card">
          {/* Avatar side */}
          <div className="profile-avatar-col">
            {/* <Avatar size={110} src="../../public/MainAvatar.png" className="profile-avatar" /> */}
            <img src={avatarImg} alt="Main Avatar" style={{ width: 150, height: 200, borderRadius: '50%', objectFit: 'cover' }} />
            <div className="profile-role-badge">Web Developer</div>
          </div>

          {/* Fields */}
          <div className="profile-fields">
            {fields.map(f => (
              <div key={f.label} className="pf-field">
                <div className="pf-label">{f.label}</div>
                <div className="pf-input">
                  <span className="pf-icon">{f.icon}</span>
                  <span className="pf-value">{f.value}</span>
                </div>
              </div>
            ))}

            {/* Links section */}
            <div className="pf-label" style={{ marginTop: 16 }}>TÀI LIỆU &amp; LIÊN KẾT</div>
            <div className="pf-links-grid">
              {links.map(l => (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="pf-link-card">
                  <span className="pf-link-icon">{l.icon}</span>
                  <span>{l.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
