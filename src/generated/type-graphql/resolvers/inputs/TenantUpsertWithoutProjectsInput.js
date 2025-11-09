"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantUpsertWithoutProjectsInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantCreateWithoutProjectsInput_1 = require("../inputs/TenantCreateWithoutProjectsInput");
const TenantUpdateWithoutProjectsInput_1 = require("../inputs/TenantUpdateWithoutProjectsInput");
const TenantWhereInput_1 = require("../inputs/TenantWhereInput");
let TenantUpsertWithoutProjectsInput = class TenantUpsertWithoutProjectsInput {
};
exports.TenantUpsertWithoutProjectsInput = TenantUpsertWithoutProjectsInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantUpdateWithoutProjectsInput_1.TenantUpdateWithoutProjectsInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantUpdateWithoutProjectsInput_1.TenantUpdateWithoutProjectsInput)
], TenantUpsertWithoutProjectsInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateWithoutProjectsInput_1.TenantCreateWithoutProjectsInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantCreateWithoutProjectsInput_1.TenantCreateWithoutProjectsInput)
], TenantUpsertWithoutProjectsInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereInput_1.TenantWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantWhereInput_1.TenantWhereInput)
], TenantUpsertWithoutProjectsInput.prototype, "where", void 0);
exports.TenantUpsertWithoutProjectsInput = TenantUpsertWithoutProjectsInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantUpsertWithoutProjectsInput", {})
], TenantUpsertWithoutProjectsInput);
