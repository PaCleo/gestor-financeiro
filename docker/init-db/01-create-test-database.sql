-- Executado automaticamente pelo entrypoint do Postgres apenas na primeira
-- inicializacao do volume (docker-entrypoint-initdb.d).
-- POSTGRES_DB=gestor ja cria o database de desenvolvimento; aqui criamos o
-- database de teste isolado usado pela suite (Vitest / .env.test).
CREATE DATABASE gestor_test;
