import * as React from "react";
import styled from "styled-components";
import banner from "../assets/logo.png";

const SBannerWrapper = styled.div`
  display: flex;
  align-items: center;
  position: relative;
`;

const SBanner = styled.div`
  width: 45px;
  height: 45px;
  background: url(${banner}) no-repeat;
  background-size: cover;
  background-position: center;
`;
const Title = styled.h1`
  margin-left: 15px;
  font-family: Open Sans;
  font-size: 40px;
`;

const Banner = () => (
  <SBannerWrapper>
    <SBanner />
    <Title>Coffee Shop</Title>
  </SBannerWrapper>
);

export default Banner;
