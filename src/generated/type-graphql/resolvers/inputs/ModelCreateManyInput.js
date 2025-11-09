"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCreateManyInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ModelCreateManyInput = class ModelCreateManyInput {
};
exports.ModelCreateManyInput = ModelCreateManyInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ModelCreateManyInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ModelCreateManyInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ModelCreateManyInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelCreateManyInput.prototype, "source", void 0);
exports.ModelCreateManyInput = ModelCreateManyInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelCreateManyInput", {})
], ModelCreateManyInput);
